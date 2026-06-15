import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { RRule } from 'rrule';
import { searchAssetYahoo } from '../utils/financeService';

const formatCurrency = (amount) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);

function PACModal({ user, accounts, onClose, onSave }) {
    // 1. FILTRI CONTI AGGIORNATI
    // Target: Solo conti Investimento
    const investmentAccounts = accounts.filter(a => a.type === 'investment' && a.status !== 'closed');
    
    // Sorgente: TUTTI i conti tranne Carte di Credito e Conti Chiusi
    const fundingAccounts = accounts.filter(a => a.type !== 'credit' && a.status !== 'closed');

    // Stati Form
    const [pacName, setPacName] = useState('');
    const [amount, setAmount] = useState('');
    const [targetAccount, setTargetAccount] = useState(''); 
    const [sourceAccount, setSourceAccount] = useState(''); 
    const [frequency, setFrequency] = useState(RRule.MONTHLY);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);

    // Stati Gestione Asset
    const [existingAssets, setExistingAssets] = useState([]);
    const [selectedAsset, setSelectedAsset] = useState(null);
    const [isNewAssetMode, setIsNewAssetMode] = useState(false);
    const [symbolQuery, setSymbolQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    // Caricamento Assets del conto target
    useEffect(() => {
        if (!targetAccount || !user?.uid) return;
        
        const fetchPortfolio = async () => {
            setExistingAssets([]);
            setSelectedAsset(null);
            try {
                const q = query(
                    collection(db, 'assets'), 
                    where('accountId', '==', targetAccount),
                    where('userId', '==', user.uid)
                );
                const snap = await getDocs(q);
                const assets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setExistingAssets(assets);
            } catch (e) { console.error("Err fetch assets:", e); }
        };
        
        const acc = accounts.find(a => a.id === targetAccount);
        if (acc && acc.type === 'investment') {
            fetchPortfolio();
        } else {
            setExistingAssets([]);
        }
    }, [targetAccount, accounts, user?.uid]);

    // Ricerca nuovi asset
    const handleSearchAsset = async (e) => {
        e.preventDefault();
        if (!symbolQuery) return;
        setIsSearching(true);
        try {
            const results = await searchAssetYahoo(symbolQuery);
            setSearchResults(results.map(r => ({
                symbol: r.symbol,
                name: r.name,
                exchange: r.exchDisp
            })).slice(0, 5));
        } catch (e) { console.error(e); }
        finally { setIsSearching(false); }
    };

    const handleSelectSearchResult = (res) => {
        setSelectedAsset({
            symbol: res.symbol,
            name: res.name,
            isNew: true 
        });
        setSearchResults([]);
        setSymbolQuery('');
    };

    // Salvataggio
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!user || !amount || !targetAccount || !sourceAccount) return;

        const isInternal = targetAccount === sourceAccount;
        const targetAccName = accounts.find(a => a.id === targetAccount)?.name;
        const sourceAccName = accounts.find(a => a.id === sourceAccount)?.name;
        const valAmount = parseFloat(amount);

        const assetLabel = selectedAsset ? `${selectedAsset.symbol}` : '';
        const finalPacName = pacName || (assetLabel ? `PAC ${assetLabel}` : `PAC ${targetAccName}`);

        const rule = `FREQ=${frequency === RRule.MONTHLY ? 'MONTHLY' : 'WEEKLY'};INTERVAL=1`;

        try {
            // Logica Giroconto: Se è un trasferimento tra conti, usa 'transfer'
            const type = isInternal ? 'expense' : 'transfer';
            const description = isInternal ? `${finalPacName} (Investimento)` : `${finalPacName}`;

            await addDoc(collection(db, 'transactions'), {
                userId: user.uid,
                description,
                amount: valAmount,
                date: startDate,
                type, // 'transfer' se conti diversi
                category: 'Investimenti',
                accountId: sourceAccount, // Esce da qui
                toAccountId: isInternal ? null : targetAccount, // Entra qui
                paymentMethod: sourceAccName,
                isRecurring: true,
                recurrenceRule: rule,
                recurrenceEndDate: null,
                isVirtual: false,
                status: 'scheduled',
                relatedAssetSymbol: selectedAsset?.symbol || null,
                relatedAssetName: selectedAsset?.name || null
            });

            if (onSave) onSave();
            onClose();
        } catch (error) {
            console.error("Errore creazione PAC:", error);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-slate-800">Configura PAC</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-rose-500 text-2xl leading-none">&times;</button>
                </div>
                
                <div className="p-6 overflow-y-auto custom-scrollbar">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Da (Sorgente)</label>
                                <select className="input-field text-sm" required value={sourceAccount} onChange={e => setSourceAccount(e.target.value)}>
                                    <option value="" disabled>Seleziona...</option>
                                    {fundingAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.cash || a.balance)})</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">A (Broker)</label>
                                <select className="input-field text-sm" required value={targetAccount} onChange={e => setTargetAccount(e.target.value)}>
                                    <option value="" disabled>Seleziona...</option>
                                    {investmentAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </div>
                        </div>

                        {targetAccount && (
                            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 animate-fadeIn">
                                <h4 className="text-xs font-bold text-indigo-800 uppercase mb-2 flex justify-between items-center">
                                    Su quale asset investire?
                                    <button type="button" onClick={() => { setIsNewAssetMode(!isNewAssetMode); setSelectedAsset(null); }} className="text-[10px] bg-white px-2 py-1 rounded border border-indigo-200 hover:text-indigo-600">
                                        {isNewAssetMode ? 'Scegli esistente' : 'Cerca nuovo'}
                                    </button>
                                </h4>

                                {!isNewAssetMode ? (
                                    existingAssets.length > 0 ? (
                                        <select className="input-field text-sm" value={selectedAsset ? JSON.stringify(selectedAsset) : ''} onChange={(e) => setSelectedAsset(JSON.parse(e.target.value))}>
                                            <option value="" disabled>Seleziona titolo...</option>
                                            {existingAssets.map(asset => (<option key={asset.id} value={JSON.stringify(asset)}>{asset.symbol} - {asset.name}</option>))}
                                        </select>
                                    ) : (
                                        <p className="text-xs text-slate-500 italic">Nessun titolo in portafoglio. Clicca "Cerca nuovo".</p>
                                    )
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        <div className="flex gap-2">
                                            <input type="text" placeholder="Cerca (es. SWDA.MI)" className="input-field text-sm rounded-r-none uppercase flex-1" value={symbolQuery} onChange={e => setSymbolQuery(e.target.value)} />
                                            <button type="button" onClick={handleSearchAsset} className="bg-indigo-600 text-white px-3 rounded-r-xl font-bold text-sm" disabled={isSearching}>{isSearching ? '...' : '🔍'}</button>
                                        </div>
                                        {searchResults.length > 0 && (
                                            <ul className="bg-white border border-indigo-100 rounded-lg max-h-32 overflow-y-auto text-xs">
                                                {searchResults.map((res, idx) => (
                                                    <li key={idx} onClick={() => handleSelectSearchResult(res)} className="p-2 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0">
                                                        <span className="font-bold">{res.symbol}</span> <span className="text-slate-500">({res.exchange})</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}

                                {selectedAsset && (
                                    <div className="mt-2 p-2 bg-white/60 rounded border border-indigo-100 flex items-center gap-2">
                                        <span className="text-lg">🎯</span>
                                        <div><p className="text-xs font-bold text-indigo-900">{selectedAsset.symbol}</p><p className="text-[10px] text-indigo-700 truncate max-w-[200px]">{selectedAsset.name}</p></div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div><label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nome PAC (Opzionale)</label><input type="text" placeholder="Es. ETF World" className="input-field" value={pacName} onChange={e => setPacName(e.target.value)} /></div>

                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-xs font-bold text-slate-400 uppercase mb-1">Importo Rata</label><input type="number" placeholder="€" className="input-field font-bold" required value={amount} onChange={e => setAmount(e.target.value)} /></div>
                            <div><label className="block text-xs font-bold text-slate-400 uppercase mb-1">Frequenza</label><select className="input-field" value={frequency} onChange={e => setFrequency(e.target.value)}><option value={RRule.MONTHLY}>Mensile</option><option value={RRule.WEEKLY}>Settimanale</option></select></div>
                        </div>

                        <div><label className="block text-xs font-bold text-slate-400 uppercase mb-1">Data Inizio</label><input type="date" className="input-field" required value={startDate} onChange={e => setStartDate(e.target.value)} /></div>

                        <button type="submit" className="btn-primary w-full py-3 mt-2">Crea Piano</button>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default PACModal;