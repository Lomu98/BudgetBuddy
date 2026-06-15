import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db, storage } from '../firebaseConfig';
import { updateProfile, updatePassword, deleteUser, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, onSnapshot, writeBatch, getDocs, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAccounts } from '../hooks/useAccounts';
import { getForexRates } from '../utils/financeService'; 
import AccountManager, { ACCOUNT_COLORS_MAP } from './AccountManager';

const formatCurrency = (amount) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);

function UserProfile() {
    const navigate = useNavigate();
    const user = auth.currentUser;
    
    // Hook conti
    const { accounts, totalNetWorth } = useAccounts(user?.uid);
    
    // Stato Asset e Cambi per calcoli precisi
    const [assets, setAssets] = useState([]);
    const [exchangeRates, setExchangeRates] = useState(null);

    // Stati Dati Utente
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [photoURL, setPhotoURL] = useState(null);

    // Stati Form e UI
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [uploadingImg, setUploadingImg] = useState(false);
    const [message, setMessage] = useState(null);
    const [isEditing, setIsEditing] = useState(false); // Stato editing profilo
    
    // Gestione Conti
    const [showAccountManager, setShowAccountManager] = useState(false);
    const [accountToEdit, setAccountToEdit] = useState(null);

    // 1. Fetch Dati Profilo e Cambi
    useEffect(() => {
        if (!user) return;
        getForexRates().then(setExchangeRates); 

        const fetchData = async () => {
            try {
                setPhotoURL(user.photoURL); 
                const docRef = doc(db, 'users', user.uid);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setUsername(data.username || user.displayName || '');
                    if (data.photoURL && !user.photoURL) setPhotoURL(data.photoURL);
                } else {
                    setUsername(user.displayName || '');
                }
                setEmail(user.email || '');
            } catch (e) { console.error(e); } finally { setLoadingProfile(false); }
        };
        fetchData();
    }, [user]);

    // 2. Fetch Assets
    useEffect(() => {
        if (!user) return;
        const q = query(collection(db, 'assets'), where('userId', '==', user.uid));
        const unsub = onSnapshot(q, (snap) => {
            setAssets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, [user]);

    // --- CALCOLI PATRIMONIALI CORRETTI ---
    const convertToEur = (price, currency) => {
        if (currency === 'EUR') return price;
        if (!exchangeRates || !exchangeRates[currency]) return price; 
        return price / exchangeRates[currency];
    };

    // A. Liquidità Reale
    const totalLiquidity = accounts.reduce((sum, acc) => {
        const balance = parseFloat(acc.balance) || 0;
        const cash = parseFloat(acc.cash) || 0;
        return sum + (acc.type === 'investment' ? cash : balance);
    }, 0);

    // B. Investito (Costo storico)
    const investedCost = assets.reduce((sum, asset) => {
        return sum + ((parseFloat(asset.quantity) || 0) * (parseFloat(asset.avgPrice) || 0));
    }, 0);

    // C. Investito (Valore Mercato)
    const investedMarketValue = assets.reduce((sum, asset) => {
        const qty = parseFloat(asset.quantity) || 0;
        const price = parseFloat(asset.currentPrice) || 0;
        return sum + (qty * convertToEur(price, asset.currency || 'EUR'));
    }, 0);

    // D. Patrimonio Netto Reale
    const realTotalNetWorth = totalLiquidity + investedMarketValue;


    // --- HANDLERS ---
    const handleImageChange = async (e) => {
        if (e.target.files[0]) {
            const file = e.target.files[0];
            setUploadingImg(true);
            try {
                const storageRef = ref(storage, `profile_images/${user.uid}`);
                await uploadBytes(storageRef, file);
                const downloadURL = await getDownloadURL(storageRef);
                await updateProfile(user, { photoURL: downloadURL });
                await updateDoc(doc(db, 'users', user.uid), { photoURL: downloadURL });
                setPhotoURL(downloadURL);
                setMessage({ type: 'success', text: 'Foto profilo aggiornata!' });
            } catch (error) {
                console.error(error);
                setMessage({ type: 'error', text: "Errore caricamento immagine." });
            } finally {
                setUploadingImg(false);
            }
        }
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        setMessage(null);
        try {
            await setDoc(doc(db, 'users', user.uid), { username }, { merge: true });
            await updateProfile(user, { displayName: username });
            if (newPassword) {
                if (newPassword.length < 6) throw new Error("Password troppo corta (min 6 caratteri).");
                if (newPassword !== confirmPassword) throw new Error("Le password non coincidono.");
                await updatePassword(user, newPassword);
            }
            setMessage({ type: 'success', text: 'Profilo aggiornato!' });
            setNewPassword(''); setConfirmPassword(''); setIsEditing(false);
        } catch (error) {
            if (error.code === 'auth/requires-recent-login') setMessage({ type: 'error', text: 'Per cambiare password devi effettuare nuovamente il login.' });
            else setMessage({ type: 'error', text: error.message });
        }
    };

    const handleDeleteUserAccount = async () => {
        if (!window.confirm("SEI SICURO? Questa azione eliminerà tutto.")) return;
        const promptMsg = prompt("Scrivi 'ELIMINA' per confermare:");
        if (promptMsg !== 'ELIMINA') return;
        
        setLoadingProfile(true);
        try {
            const batch = writeBatch(db);
            batch.delete(doc(db, 'users', user.uid));
            
            // Helper per cancellare collezioni
            const deleteColl = async (name) => {
                const q = query(collection(db, name), where('userId', '==', user.uid));
                const s = await getDocs(q);
                s.forEach(d => batch.delete(d.ref));
            };
            
            await Promise.all([
                deleteColl('accounts'), deleteColl('transactions'), 
                deleteColl('assets'), deleteColl('budgets'), deleteColl('goals')
            ]);
            
            await batch.commit();
            await deleteUser(user);
            navigate('/auth');
        } catch (error) {
            console.error(error);
            if (error.code === 'auth/requires-recent-login') { 
                alert("Riaccedi per eliminare l'account."); 
                await signOut(auth); 
                navigate('/auth'); 
            } else { 
                setMessage({ type: 'error', text: "Errore: " + error.message }); 
                setLoadingProfile(false); 
            }
        }
    };

    // --- FIX NAVIGAZIONE ---
    const handleAccountClick = (acc) => {
        if (acc.type === 'investment') {
            navigate('/investments', { state: { accountId: acc.id } });
        } else {
            navigate(`/account/${acc.id}`);
        }
    };

    const handleEditAccount = (acc) => { setAccountToEdit(acc); setShowAccountManager(true); };
    const handleDeleteAccount = async (id) => { if(window.confirm("Eliminare conto?")) { try { await deleteDoc(doc(db, 'accounts', id)); } catch(e) { console.error(e); } } };

    if (loadingProfile) return <div className="min-h-screen flex items-center justify-center text-slate-400 bg-slate-50">Caricamento...</div>;

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-10">
            <nav className="bg-white border-b border-slate-200 sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
                    <h1 className="text-xl font-bold text-slate-900">Il mio Profilo</h1>
                    <button onClick={() => navigate('/')} className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition">&larr; Dashboard</button>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto px-4 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* COLONNA SX: INFO UTENTE */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                        <div className="flex flex-col items-center mb-6 border-b border-slate-50 pb-6">
                            <div className="relative group">
                                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-slate-50 shadow-md bg-indigo-100 text-indigo-600 flex items-center justify-center text-3xl font-bold">
                                    {uploadingImg ? <svg className="animate-spin h-8 w-8" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : photoURL ? <img src={photoURL} alt="Profilo" className="w-full h-full object-cover" /> : <span>{username ? username.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase()}</span>}
                                </div>
                                <label htmlFor="profile-upload" className="absolute bottom-0 right-0 bg-white p-2 rounded-full shadow-md cursor-pointer hover:bg-indigo-50 border border-slate-200 transition-colors">
                                    <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                </label>
                                <input id="profile-upload" type="file" className="hidden" accept="image/*" onChange={handleImageChange} disabled={uploadingImg} />
                            </div>
                            <h2 className="text-xl font-bold text-slate-800 mt-4">{username || 'Utente'}</h2>
                            <p className="text-sm text-slate-500">{email}</p>
                        </div>

                        {message && <div className={`p-3 rounded-lg text-sm mb-4 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{message.text}</div>}

                        <form onSubmit={handleSaveProfile} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome Utente</label>
                                <div className="flex gap-2">
                                    <input type="text" className="input-field" value={username} onChange={(e) => setUsername(e.target.value)} disabled={!isEditing} />
                                    
                                    <button 
                                        type="button" 
                                        onClick={(e) => { e.preventDefault(); setIsEditing(true); }} 
                                        className={`bg-slate-100 text-slate-600 px-4 rounded-lg font-bold text-sm hover:bg-slate-200 ${isEditing ? 'hidden' : ''}`}
                                    >
                                        Modifica
                                    </button>

                                    <button 
                                        type="submit" 
                                        className={`bg-indigo-600 text-white px-4 rounded-lg font-bold text-sm hover:bg-indigo-700 ${!isEditing ? 'hidden' : ''}`}
                                    >
                                        Salva
                                    </button>
                                </div>
                            </div>
                            {isEditing && (
                                <div className="animate-fadeIn">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cambia Password</label>
                                    <input type="password" className="input-field mb-2" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Nuova Password" />
                                    <input type="password" className="input-field" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Conferma Password" />
                                </div>
                            )}
                        </form>
                    </div>

                    <div className="bg-rose-50 p-6 rounded-2xl border border-rose-100">
                        <h3 className="text-sm font-bold text-rose-700 uppercase tracking-wider mb-2">Zona Pericolosa</h3>
                        <button onClick={handleDeleteUserAccount} className="w-full py-2 bg-white border border-rose-200 text-rose-600 font-bold rounded-xl text-sm hover:bg-rose-600 hover:text-white transition shadow-sm">Elimina Account</button>
                    </div>
                </div>

                {/* COLONNA DX: PATRIMONIO & CONTI */}
                <div className="lg:col-span-8 space-y-8">
                    
                    {/* CARD PATRIMONIO */}
                    <div className="bg-slate-900 p-6 rounded-2xl text-white shadow-lg relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -mr-20 -mt-20 pointer-events-none"></div>
                        <div className="relative z-10 text-center md:text-left">
                            <div className="flex items-center justify-center md:justify-start gap-2 mb-1 opacity-80">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <span className="text-xs font-bold uppercase tracking-wider">Patrimonio Netto</span>
                            </div>
                            <p className="text-4xl font-bold font-mono tracking-tight">{formatCurrency(realTotalNetWorth)}</p>
                        </div>
                        <div className="relative z-10 flex gap-8 md:gap-12 border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-8 w-full md:w-auto justify-center md:justify-end">
                            <div className="text-center md:text-right">
                                <p className="text-[10px] uppercase font-bold text-emerald-400 mb-1">Liquidità</p>
                                <p className="font-mono font-bold text-xl">{formatCurrency(totalLiquidity)}</p>
                            </div>
                            <div className="text-center md:text-right">
                                <p className="text-[10px] uppercase font-bold text-indigo-400 mb-1">Investito</p>
                                <p className="font-mono font-bold text-xl">{formatCurrency(investedCost)}</p>
                            </div>
                        </div>
                    </div>

                    {/* LISTA CONTI */}
                    <div>
                        <div className="mb-4">
                            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">I tuoi Conti</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            
                            {/* CARD AGGIUNGI CONTO */}
                            <div 
                                onClick={() => { setAccountToEdit(null); setShowAccountManager(true); }}
                                className="cursor-pointer p-5 rounded-2xl border-2 border-dashed border-slate-300 flex flex-col justify-center items-center h-40 text-slate-400 hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all duration-300 group bg-white/50"
                            >
                                <div className="w-12 h-12 rounded-full bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center mb-2 transition-colors">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                    </svg>
                                </div>
                                <span className="font-bold text-sm">Aggiungi Conto</span>
                            </div>

                            {accounts.map(acc => {
                                // Usa la mappa colori globale
                                const theme = ACCOUNT_COLORS_MAP[acc.color] || ACCOUNT_COLORS_MAP['blue'];
                                const isClosed = acc.status === 'closed';
                                
                                // Rileva se il tema è chiaro (es. Avorio) per cambiare colore testo
                                const isLight = theme.text !== 'text-white';

                                // CALCOLO DINAMICO PER VISUALIZZAZIONE CORRETTA
                                let displayBalance = parseFloat(acc.balance) || 0;
                                
                                if (acc.type === 'investment') {
                                    const accountAssets = assets.filter(a => a.accountId === acc.id);
                                    const assetsVal = accountAssets.reduce((sum, a) => {
                                        const qty = parseFloat(a.quantity) || 0;
                                        const price = parseFloat(a.currentPrice) || 0;
                                        return sum + (qty * convertToEur(price, a.currency || 'EUR'));
                                    }, 0);
                                    // Totale Conto = Liquidità (input manuale) + Valore Asset
                                    displayBalance = (parseFloat(acc.cash) || 0) + assetsVal;
                                }

                                return (
                                    <div 
                                        key={acc.id} 
                                        onClick={() => handleAccountClick(acc)} 
                                        // FIX: rimosso 'text-white' fisso, usa theme.text
                                        className={`cursor-pointer p-5 rounded-2xl shadow-sm flex flex-col justify-between h-40 relative overflow-hidden group transition-all duration-300 hover:shadow-lg ${theme.bg} ${theme.text} ${isClosed ? 'opacity-60 grayscale hover:grayscale-0' : ''}`}
                                    >
                                        {isClosed && <div className="absolute inset-0 bg-slate-900/10 z-0"></div>}
                                        
                                        {/* Decorazione Sfondo Adattiva */}
                                        <div className={`absolute right-0 top-0 w-24 h-24 rounded-full -mr-8 -mt-8 ${isLight ? 'bg-stone-600/5' : 'bg-white/10'}`}></div>
                                        
                                        <div className="flex justify-between items-start relative z-10">
                                            <div>
                                                <span className="text-[10px] font-bold uppercase opacity-70 tracking-wider flex items-center gap-2">
                                                    {acc.type === 'credit' ? 'Carta di Credito' : acc.type === 'investment' ? 'Investimenti' : acc.type === 'cash' ? 'Contanti' : acc.type === 'savings' ? 'Risparmi' : 'Conto Corrente'}
                                                    {isClosed && <span className="bg-black/30 px-1.5 rounded text-[9px] text-white">CHIUSO</span>}
                                                </span>
                                                <h4 className="text-lg font-bold mt-0.5 truncate w-40">{acc.name}</h4>
                                            </div>
                                            
                                            {/* Icone Coerenti & Adattive */}
                                            <div className={`p-2 rounded-lg ${isLight ? 'bg-black/5 text-stone-700' : 'bg-white/20 text-white'}`}>
                                                {acc.type === 'credit' ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg> : 
                                                 acc.type === 'investment' ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg> :
                                                 acc.type === 'cash' ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg> : 
                                                 <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /></svg>}
                                            </div>
                                        </div>

                                        <div className="relative z-10 mt-auto">
                                            {/* QUI USIAMO displayBalance calcolato al volo */}
                                            <span className="text-2xl font-mono font-bold">{formatCurrency(displayBalance)}</span>
                                            
                                            {acc.type === 'credit' && acc.creditLimit && (
                                                <div className="w-full bg-black/10 h-1 rounded-full mt-2 overflow-hidden">
                                                    {/* Barra adattiva: scura su sfondo chiaro, bianca su sfondo scuro */}
                                                    <div className={`h-1 rounded-full ${isLight ? 'bg-stone-800' : 'bg-white'}`} style={{ width: `${Math.min(100, ((acc.creditLimit + acc.balance) / acc.creditLimit) * 100)}%` }}></div>
                                                </div>
                                            )}
                                            {acc.type === 'investment' && (
                                                <p className="text-[10px] opacity-80 mt-1 font-medium">Cash: {formatCurrency(acc.cash || 0)}</p>
                                            )}
                                        </div>

                                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition duration-200 z-20">
                                            <button onClick={(e) => { e.stopPropagation(); handleEditAccount(acc); }} className="p-1.5 bg-black/10 hover:bg-black/20 rounded-lg backdrop-blur-sm"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteAccount(acc.id); }} className="p-1.5 bg-black/10 hover:bg-red-500/80 rounded-lg hover:text-white backdrop-blur-sm"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
            
            {showAccountManager && (
                <AccountManager 
                    user={user} 
                    accounts={accounts} 
                    accountToEdit={accountToEdit} 
                    assets={assets} /* PASSATO PER CALCOLI CORRETTI */
                    exchangeRates={exchangeRates} /* PASSATO PER CALCOLI CORRETTI */
                    onClose={() => setShowAccountManager(false)} 
                />
            )}
        </div>
    );
}

export default UserProfile;