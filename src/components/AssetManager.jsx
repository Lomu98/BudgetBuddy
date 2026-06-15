import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, updateDoc, orderBy, getDocs, runTransaction } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { searchAssetYahoo, getPriceYahoo, getForexRates } from '../utils/financeService';
import { getAiAssetPrice } from '../utils/aiService';
import { format } from 'date-fns';

const formatCurrency = (amount, currency = 'EUR') => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: currency }).format(amount || 0);
};

const safeParseFloat = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const cleanVal = val.toString().replace(/,/g, '.').replace(/\s/g, '');
    return parseFloat(cleanVal) || 0;
};

function AssetManager({ user, account, onClose }) {
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exchangeRates, setExchangeRates] = useState(null);
    
    // Form States
    const [symbolQuery, setSymbolQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [selectedSymbol, setSelectedSymbol] = useState(null);
    const [quantity, setQuantity] = useState('');
    const [avgPrice, setAvgPrice] = useState(''); 
    const [manualCurrentPrice, setManualCurrentPrice] = useState(''); 
    const [assetCurrency, setAssetCurrency] = useState('EUR');

    const [isSearching, setIsSearching] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [isAiEstimatedPrice, setIsAiEstimatedPrice] = useState(false);
    const [aiSourceInfo, setAiSourceInfo] = useState('');

    // Edit States
    const [expandedAssetId, setExpandedAssetId] = useState(null);
    const [assetHistory, setAssetHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [editQuantity, setEditQuantity] = useState('');
    const [editAvgPrice, setEditAvgPrice] = useState('');
    const [editCurrentPrice, setEditCurrentPrice] = useState(''); 

    // 1. LOAD
    useEffect(() => {
        if (!account?.id || !user?.uid) return;
        
        getForexRates().then(rates => setExchangeRates(rates));

        const q = query(
            collection(db, 'assets'), 
            where('accountId', '==', account.id),
            where('userId', '==', user.uid)
        );
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loadedAssets = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setAssets(loadedAssets);
            setLoading(false);
        }, (error) => {
            console.error("Errore assets:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [account.id, user.uid]);

    const convertToEur = (price, currency, rates = exchangeRates) => {
        if (currency === 'EUR') return price;
        if (!rates || !rates[currency]) return price; 
        return price / rates[currency];
    };

    // --- CORE LOGIC: RICALCOLO SALDO TOTALE ---
    const updateAccountBalance = async (currentAssets, rates = exchangeRates, explicitCash = null) => {
        // Se abbiamo appena modificato la liquidità (es. dopo un acquisto), usiamo il valore esplicito.
        // Altrimenti usiamo quello che c'è nel conto (prop).
        // IMPORTANTE: Usiamo (account.cash || 0) come fallback se explicitCash non è passato.
        const currentCash = explicitCash !== null ? explicitCash : (account.cash !== undefined ? account.cash : 0);
        
        // Calcola valore totale asset in EUR
        const assetsValueEur = currentAssets.reduce((sum, a) => {
            const priceEur = convertToEur(a.currentPrice, a.currency || 'EUR', rates);
            return sum + (a.quantity * priceEur);
        }, 0);

        // Saldo Totale = Liquidità + Valore Asset
        const totalBalance = currentCash + assetsValueEur;

        // Aggiorna Firestore
        await updateDoc(doc(db, 'accounts', account.id), { balance: totalBalance });
    };

    // 2. SEARCH
    const handleSearch = async (e) => {
        e.preventDefault();
        if (!symbolQuery) return;
        setIsSearching(true);
        setSearchResults([]);
        try {
            const results = await searchAssetYahoo(symbolQuery);
            setSearchResults(results.map(r => ({
                symbol: r.symbol, description: r.name, exchange: r.exchDisp, type: 'Yahoo'
            })));
        } catch (e) { console.error(e); } 
        finally { setIsSearching(false); }
    };

    // 3. SELECT
    const handleSelectSymbol = async (res) => {
        setSelectedSymbol(res);
        setSearchResults([]);
        setSymbolQuery(res.symbol);
        
        setStatusMessage(`Controllo ${res.exchange}...`);
        setIsAiEstimatedPrice(false);
        setAiSourceInfo('');
        setManualCurrentPrice('');
        
        let priceData = await getPriceYahoo(res.symbol);
        
        if (priceData && priceData.price > 0) {
            setManualCurrentPrice(priceData.price.toString());
            setAssetCurrency(priceData.currency || 'EUR');
            setStatusMessage(`Prezzo Yahoo`);
        } else {
            setStatusMessage('Analisi AI...');
            const aiData = await getAiAssetPrice(res.symbol, res.description);
            if (aiData && aiData.price) {
                setManualCurrentPrice(aiData.price.toString());
                setAssetCurrency(aiData.currency || 'EUR');
                setIsAiEstimatedPrice(true);
                setAiSourceInfo(`Stima AI (${aiData.source})`);
                setStatusMessage('Trovato via AI');
            } else {
                setStatusMessage('Prezzo non trovato.');
            }
        }
    };

    // 4. ADD ASSET (Atomica con Fix Balance)
    const handleAddAsset = async () => {
        if ((!selectedSymbol && !symbolQuery) || !quantity) return;
        
        const finalSymbol = selectedSymbol ? selectedSymbol.symbol : symbolQuery.toUpperCase();
        const finalName = selectedSymbol ? selectedSymbol.description : symbolQuery.toUpperCase();
        const numQty = safeParseFloat(quantity);
        const numAvgPrice = safeParseFloat(avgPrice);
        const numManualPrice = safeParseFloat(manualCurrentPrice);

        let currentPrice = numManualPrice || numAvgPrice || 0;
        
        // Costo in EUR (per scalare la liquidità)
        const costEur = numQty * numAvgPrice; 
        const currentCash = account.cash || 0;
        
        if (currentCash < costEur) {
             if (!window.confirm(`Liquidità insufficiente (${formatCurrency(currentCash)}). Il conto andrà in rosso. Procedere?`)) return;
        }

        const newAsset = {
            userId: user.uid,
            accountId: account.id,
            symbol: finalSymbol,
            name: finalName,
            quantity: numQty,
            avgPrice: numAvgPrice,
            currentPrice: currentPrice,
            currency: assetCurrency,
            isAiEstimated: isAiEstimatedPrice, 
            aiSource: isAiEstimatedPrice ? aiSourceInfo : null,
            lastUpdated: new Date().toISOString()
        };

        try {
            let newCashBalance = currentCash;

            await runTransaction(db, async (transaction) => {
                const accRef = doc(db, 'accounts', account.id);
                const accDoc = await transaction.get(accRef);
                if (!accDoc.exists()) throw "Conto non trovato";
                
                const d = accDoc.data();
                const oldCash = (d.cash !== undefined) ? d.cash : d.balance;
                newCashBalance = oldCash - costEur;

                // 1. Aggiorna Cash
                transaction.update(accRef, { cash: newCashBalance });

                // 2. Crea Asset
                const assetRef = doc(collection(db, 'assets'));
                transaction.set(assetRef, newAsset);

                // 3. Crea Transazione
                const transRef = doc(collection(db, 'transactions'));
                transaction.set(transRef, {
                    userId: user.uid, accountId: account.id, assetId: assetRef.id,
                    date: new Date().toISOString().split('T')[0], amount: costEur,
                    type: 'expense', category: 'Investimenti', description: `Acquisto ${finalSymbol}`,
                    paymentMethod: account.name, isRecurring: false, isVirtual: false
                });
            });

            // FIX: Aggiorna il Balance Totale passando ESPLICITAMENTE il nuovo cash calcolato
            // (perché la prop 'account' non è ancora aggiornata)
            const newAssetWithId = { ...newAsset, id: 'temp' };
            updateAccountBalance([...assets, newAssetWithId], exchangeRates, newCashBalance);

            // Reset
            setSymbolQuery(''); setSearchResults([]); setSelectedSymbol(null); setQuantity(''); setAvgPrice(''); setManualCurrentPrice(''); setAssetCurrency('EUR'); setIsAiEstimatedPrice(false); setStatusMessage('');
        } catch (e) { console.error("Errore aggiunta:", e); alert("Errore: " + e); }
    };

    // 5. REFRESH PREZZI
    const handleRefreshPrices = async () => {
        setIsRefreshing(true);
        const newRates = await getForexRates();
        if (newRates) setExchangeRates(newRates);

        const updatedAssets = [];
        for (const asset of assets) {
            let price = null;
            let isAi = false;
            let source = null;

            const yahooData = await getPriceYahoo(asset.symbol);
            if (yahooData && yahooData.price > 0) {
                price = yahooData.price;
            }

            if (!price || price === 0) {
                const aiData = await getAiAssetPrice(asset.symbol, asset.name);
                if (aiData && aiData.price) {
                    price = aiData.price;
                    isAi = true;
                    source = aiData.source;
                }
            }

            if (price && price > 0) {
                const updated = { ...asset, currentPrice: price, isAiEstimated: isAi, aiSource: source, lastUpdated: new Date().toISOString() };
                await updateDoc(doc(db, 'assets', asset.id), { 
                    currentPrice: price, isAiEstimated: isAi, aiSource: source, lastUpdated: updated.lastUpdated 
                });
                updatedAssets.push(updated);
            } else {
                updatedAssets.push(asset);
            }
        }
        
        // Qui la liquidità NON cambia, quindi passiamo null (o non lo passiamo) per usare account.cash
        await updateAccountBalance(updatedAssets, newRates || exchangeRates);
        setIsRefreshing(false);
    };

    // 6. EDIT & DELETE
    const handleUpdateAsset = async (assetId) => {
        const numQty = safeParseFloat(editQuantity);
        const numPrice = safeParseFloat(editAvgPrice);
        const numCurPrice = safeParseFloat(editCurrentPrice);
        try {
            await updateDoc(doc(db, 'assets', assetId), { 
                quantity: numQty, avgPrice: numPrice, currentPrice: numCurPrice 
            });
            setExpandedAssetId(null);
            const updatedList = assets.map(a => a.id === assetId ? { ...a, quantity: numQty, avgPrice: numPrice, currentPrice: numCurPrice } : a);
            // Non cambia il cash in edit semplice, ricalcola solo balance
            updateAccountBalance(updatedList, exchangeRates);
        } catch (e) { console.error("Errore update:", e); }
    };

    const handleDelete = async (assetId) => {
        if (!window.confirm("Rimuovere questo titolo? Il capitale investito (PMC) tornerà nella liquidità.")) return;
        
        const assetToDelete = assets.find(a => a.id === assetId);
        const cashBack = assetToDelete.quantity * assetToDelete.avgPrice; 
        
        try {
            let newCash = 0;
            await runTransaction(db, async (transaction) => {
                 const accRef = doc(db, 'accounts', account.id);
                 const accDoc = await transaction.get(accRef);
                 const oldCash = (accDoc.data().cash !== undefined) ? accDoc.data().cash : accDoc.data().balance;
                 newCash = oldCash + cashBack;
                 
                 transaction.update(accRef, { cash: newCash });
                 transaction.delete(doc(db, 'assets', assetId));
            });
            
            const newAssets = assets.filter(a => a.id !== assetId);
            // FIX: Passa il nuovo cash per aggiornare il totale corretto
            updateAccountBalance(newAssets, exchangeRates, newCash);
        } catch (e) { console.error(e); }
    };

    // 7. EXPAND & HISTORY
    const handleExpand = async (asset) => {
        if (expandedAssetId === asset.id) { setExpandedAssetId(null); return; }
        setExpandedAssetId(asset.id);
        setEditQuantity(asset.quantity);
        setEditAvgPrice(asset.avgPrice);
        setEditCurrentPrice(asset.currentPrice);
        setLoadingHistory(true);
        try {
            const q = query(collection(db, 'transactions'), where('assetId', '==', asset.id), where('userId', '==', user.uid), orderBy('date', 'desc'));
            const snap = await getDocs(q);
            setAssetHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { console.warn(e); setAssetHistory([]); } finally { setLoadingHistory(false); }
    };

    // Totali UI (Usano i tassi di cambio per la visualizzazione)
    const totalInvestedEur = assets.reduce((sum, a) => sum + (a.quantity * a.avgPrice), 0);
    const totalCurrentValueEur = assets.reduce((sum, a) => sum + (a.quantity * convertToEur(a.currentPrice, a.currency || 'EUR')), 0);
    const totalGainEur = totalCurrentValueEur - totalInvestedEur;
    const totalGainPercent = totalInvestedEur > 0 ? (totalGainEur / totalInvestedEur) * 100 : 0;

    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <div><h3 className="font-bold text-slate-800 text-lg">{account.name} <span className="text-slate-400 font-normal text-sm">| Portafoglio</span></h3></div>
                    <button onClick={onClose} className="text-slate-400 hover:text-rose-500 text-2xl leading-none">&times;</button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar">
                    
                    {/* KPI */}
                    <div className="grid grid-cols-3 gap-4 mb-8">
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center"><p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Investito (EUR)</p><p className="text-xl font-bold text-slate-700">{formatCurrency(totalInvestedEur)}</p></div>
                        <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 text-center"><p className="text-xs text-indigo-400 uppercase font-bold tracking-wider">Valore (EUR)</p><p className="text-2xl font-bold text-indigo-600">{formatCurrency(totalCurrentValueEur)}</p></div>
                        <div className={`p-4 rounded-xl border text-center ${totalGainEur >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}><p className="text-xs uppercase font-bold tracking-wider">P&L</p><p className="text-xl font-bold">{totalGainEur >= 0 ? '+' : ''}{formatCurrency(totalGainEur)} <span className="text-sm opacity-80">({totalGainPercent.toFixed(2)}%)</span></p></div>
                    </div>

                    {/* FORM AGGIUNTA */}
                    <div className="mb-8 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                        <h4 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wide flex items-center gap-2"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>Aggiungi Titolo</h4>
                        <div className="flex gap-3 mb-2 flex-wrap sm:flex-nowrap">
                            <div className="flex-1 relative min-w-[180px]">
                                <div className="flex"><input type="text" placeholder="Simbolo/ISIN" className="input-field rounded-r-none uppercase" value={symbolQuery} onChange={e => setSymbolQuery(e.target.value)} /><button onClick={handleSearch} disabled={isSearching} className="bg-slate-100 px-4 rounded-r-xl border-y border-r border-slate-200 hover:bg-slate-200 text-slate-600 font-bold">{isSearching ? '...' : '🔍'}</button></div>
                                {searchResults.length > 0 && (<ul className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-lg mt-1 shadow-xl z-20 max-h-48 overflow-y-auto">{searchResults.map((res, idx) => (<li key={idx} onClick={() => handleSelectSymbol(res)} className="p-3 hover:bg-indigo-50 cursor-pointer text-sm border-b border-slate-50 last:border-0 flex justify-between"><span className="font-bold text-slate-700">{res.symbol}</span><span className="text-slate-500 truncate max-w-[150px]">{res.description}</span></li>))}</ul>)}
                            </div>
                            <input type="text" placeholder="Qta" className="input-field w-16" value={quantity} onChange={e => setQuantity(e.target.value)} />
                            <input type="text" placeholder="PMC €" className="input-field w-20" value={avgPrice} onChange={e => setAvgPrice(e.target.value)} />
                            <div className="relative"><input type="text" placeholder="Valore" className={`input-field w-24 border-dashed ${isAiEstimatedPrice ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-indigo-300'}`} value={manualCurrentPrice} onChange={e => setManualCurrentPrice(e.target.value)} title={statusMessage || "Prezzo attuale"} />{isAiEstimatedPrice && <span className="absolute -top-2 -right-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 shadow-sm">🤖</span>}</div>
                            <select className="input-field w-20 font-bold text-slate-600 cursor-pointer" value={assetCurrency} onChange={e => setAssetCurrency(e.target.value)}><option value="EUR">EUR</option><option value="USD">USD</option></select>
                            <button onClick={handleAddAsset} className="bg-indigo-600 text-white px-5 rounded-xl font-bold hover:bg-indigo-700 flex items-center justify-center"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></button>
                        </div>
                        <div className="flex justify-between items-center mt-2 px-1">{selectedSymbol ? <p className="text-xs text-emerald-600 font-medium">Selezionato: {selectedSymbol.description}</p> : <span></span>}{statusMessage && <p className="text-xs text-slate-400 italic text-right animate-fadeIn">{statusMessage}</p>}</div>
                    </div>

                    {/* LISTA */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center mb-2 px-1">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Le tue posizioni</h4>
                            <button onClick={handleRefreshPrices} disabled={isRefreshing || loading} className="text-xs flex items-center gap-1 text-indigo-600 hover:underline font-medium disabled:opacity-50"><svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> {isRefreshing ? 'Aggiornamento...' : 'Aggiorna Prezzi'}</button>
                        </div>
                        {!loading && assets.length === 0 && <p className="text-slate-400 text-sm italic text-center py-8 border-2 border-dashed border-slate-100 rounded-xl">Vuoto.</p>}
                        {assets.map(asset => {
                            const priceInEur = convertToEur(asset.currentPrice, asset.currency || 'EUR');
                            const valueEur = asset.quantity * priceInEur;
                            const gainEur = valueEur - (asset.quantity * asset.avgPrice);
                            const gainPercent = asset.avgPrice > 0 ? (gainEur / (asset.quantity * asset.avgPrice)) * 100 : 0;
                            const isExpanded = expandedAssetId === asset.id;

                            return (
                                <div key={asset.id} className="bg-white rounded-xl border border-slate-100 overflow-hidden hover:border-indigo-200 transition shadow-sm">
                                    <div onClick={() => handleExpand(asset)} className="flex justify-between items-center p-4 cursor-pointer bg-slate-50/50 hover:bg-slate-50">
                                        <div>
                                            <div className="flex items-center gap-2"><span className="font-bold text-slate-800 text-lg">{asset.symbol}</span><span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-200 rounded text-slate-600">{asset.currency}</span>{asset.isAiEstimated && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200" title={`Fonte: ${asset.aiSource}`}>🤖 AI</span>}</div>
                                            <p className="text-xs text-slate-500 mt-1 font-medium flex gap-2"><span>{asset.quantity} quote</span><span className="text-slate-300">|</span><span>PMC: {formatCurrency(asset.avgPrice)}</span><span className="text-slate-300">|</span><span className="text-indigo-600">Mkt: {formatCurrency(asset.currentPrice, asset.currency)}</span></p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right"><p className="font-mono font-bold text-slate-800">{formatCurrency(valueEur, 'EUR')}</p><p className={`text-xs font-bold ${gainEur >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{gainEur >= 0 ? '+' : ''}{formatCurrency(gainEur)} ({gainPercent.toFixed(2)}%)</p></div>
                                            <div className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg></div>
                                        </div>
                                    </div>
                                    {isExpanded && (
                                        <div className="p-4 border-t border-slate-100 bg-white animate-fadeIn">
                                            <div className="flex items-end gap-2 mb-6 bg-indigo-50/50 p-3 rounded-lg">
                                                <div className="flex-1"><label className="text-[10px] font-bold text-slate-400 uppercase">Qta</label><input type="text" className="input-field text-sm py-1" value={editQuantity} onChange={e => setEditQuantity(e.target.value)} /></div>
                                                <div className="flex-1"><label className="text-[10px] font-bold text-slate-400 uppercase">PMC</label><input type="text" className="input-field text-sm py-1" value={editAvgPrice} onChange={e => setEditAvgPrice(e.target.value)} /></div>
                                                <div className="flex-1"><label className="text-[10px] font-bold text-slate-400 uppercase">Mkt</label><input type="text" className="input-field text-sm py-1 border-dashed border-indigo-300" value={editCurrentPrice} onChange={e => setEditCurrentPrice(e.target.value)} /></div>
                                                <button onClick={() => handleUpdateAsset(asset.id)} className="bg-indigo-600 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 h-[38px]">Salva</button>
                                                <button onClick={() => handleDelete(asset.id)} className="bg-white border border-rose-200 text-rose-600 px-3 py-2 rounded-lg text-xs font-bold hover:bg-rose-50 h-[38px]">Elimina</button>
                                            </div>
                                            <div><h5 className="text-xs font-bold text-slate-400 uppercase mb-2">Storico Movimenti</h5>{loadingHistory ? (<p className="text-xs text-slate-400">Caricamento...</p>) : assetHistory.length > 0 ? (<ul className="divide-y divide-slate-50 text-xs">{assetHistory.map(tx => (<li key={tx.id} className="py-2 flex justify-between text-slate-600"><span>{format(new Date(tx.date), 'dd/MM/yyyy')}</span><span>{tx.description}</span><span className="font-bold">{formatCurrency(tx.amount)}</span></li>))}</ul>) : (<p className="text-xs text-slate-400 italic">Nessuno storico.</p>)}</div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AssetManager;