import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, updateDoc, deleteDoc, runTransaction, query, where, onSnapshot, addDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { signOut } from 'firebase/auth';
import { format, subMonths, addMonths, setMonth, setYear } from 'date-fns';
import { it } from 'date-fns/locale';
import { useRecurringTransactions } from '../hooks/useRecurringTransactions';
import { useUserSuggestions } from '../hooks/useUserSuggestions';
import { useAccounts } from '../hooks/useAccounts';
import { getSmartCategorization } from '../utils/aiService'; // CORRETTO: Solo AI qui
import { getForexRates } from '../utils/financeService'; // CORRETTO: Forex qui
import EditModal from './EditModal';
import FinancialInsights from './FinancialInsights';

// Helpers
const formatCurrency = (amount) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);
const getMonthName = (date) => format(date, 'MMMM yyyy', { locale: it });
const formatRecurrenceLabel = (ruleString) => {
    if (!ruleString) return '';
    const intervalMatch = ruleString.match(/INTERVAL=(\d+)/);
    const freqMatch = ruleString.match(/FREQ=([A-Z]+)/);
    const interval = intervalMatch ? parseInt(intervalMatch[1], 10) : 1;
    const freq = freqMatch ? freqMatch[1] : '';
    const terms = { DAILY: { s: 'giorno', p: 'giorni' }, WEEKLY: { s: 'settimana', p: 'settimane' }, MONTHLY: { s: 'mese', p: 'mesi' }, YEARLY: { s: 'anno', p: 'anni' } };
    if (!terms[freq]) return ruleString; 
    const unit = interval === 1 ? terms[freq].s : terms[freq].p;
    return `Ogni ${interval === 1 ? '' : interval + ' '}${unit}`;
};

const MONTHS_IT = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

function Dashboard() {
  const navigate = useNavigate();
  const user = auth.currentUser;
  const displayName = user?.displayName || user?.email;
  
  // --- STATI DATI ---
  const [currentDate, setCurrentDate] = useState(new Date()); 
  const { transactions, loading, refetch } = useRecurringTransactions(user?.uid, currentDate);
  const { categories: suggestedCategories, paymentMethods: suggestedMethods } = useUserSuggestions(user?.uid);
  const { accounts } = useAccounts(user?.uid); 

  // Stati per Calcolo Patrimonio Reale
  const [assets, setAssets] = useState([]);
  const [exchangeRates, setExchangeRates] = useState(null);

  // Stati Budget & Goals
  const [budgets, setBudgets] = useState([]);
  const [goals, setGoals] = useState([]);

  // Stati Filtri Transazioni
  const [filterType, setFilterType] = useState('all'); 
  const [filterCategory, setFilterCategory] = useState('all');

  // --- CALCOLO DINAMICO DEGLI ANNI ---
  const availableYears = useMemo(() => {
      const startYear = 2022;
      const currentYear = new Date().getFullYear();
      const endYear = currentYear + 2; 
      const years = [];
      for (let y = startYear; y <= endYear; y++) {
          years.push(y);
      }
      return years;
  }, []);

  // Fetch Dati Secondari (Assets, Budget, Goals, Forex)
  useEffect(() => {
      if (!user) return;
      
      // Carica Tassi Cambio
      getForexRates().then(setExchangeRates);

      // Carica Assets per calcolo patrimonio
      const qA = query(collection(db, 'assets'), where('userId', '==', user.uid));
      const unsubA = onSnapshot(qA, (snap) => setAssets(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

      const qB = query(collection(db, 'budgets'), where('userId', '==', user.uid));
      const unsubB = onSnapshot(qB, (snap) => setBudgets(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
      
      const qG = query(collection(db, 'goals'), where('userId', '==', user.uid));
      const unsubG = onSnapshot(qG, (snap) => setGoals(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
      
      return () => { unsubA(); unsubB(); unsubG(); };
  }, [user]);

  // --- CALCOLI PATRIMONIALI (Coerenti con UserProfile) ---
  const convertToEur = (price, currency) => {
      if (currency === 'EUR') return price;
      if (!exchangeRates || !exchangeRates[currency]) return price; 
      return price / exchangeRates[currency];
  };

  // 1. Liquidità Totale (Cash dai conti investimento + Saldo conti normali)
  const totalLiquidity = useMemo(() => {
      return accounts.reduce((sum, acc) => {
          if (acc.status === 'closed') return sum; 
          const balance = parseFloat(acc.balance) || 0;
          if (acc.type === 'investment') {
              return sum + (parseFloat(acc.cash) || 0);
          }
          return sum + balance;
      }, 0);
  }, [accounts]);

  // 2. Valore Investimenti (Live)
  const investedMarketValue = useMemo(() => {
      return assets.reduce((sum, asset) => {
          const qty = parseFloat(asset.quantity) || 0;
          const price = parseFloat(asset.currentPrice) || 0;
          return sum + (qty * convertToEur(price, asset.currency || 'EUR'));
      }, 0);
  }, [assets, exchangeRates]);

  // 3. Patrimonio Netto Reale (Liquidità + Investimenti)
  const realTotalNetWorth = totalLiquidity + investedMarketValue;


  // Form States
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(currentDate, 'yyyy-MM-dd')); 
  const [type, setType] = useState('expense');
  const [category, setCategory] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  
  // UI States
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState(null);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(null);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editMode, setEditMode] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Navigation
  const handleMonthChange = (e) => { setCurrentDate(prev => { const d = setMonth(prev, parseInt(e.target.value)); setDate(format(d, 'yyyy-MM-dd')); return d; }); };
  const handleYearChange = (e) => { setCurrentDate(prev => { const d = setYear(prev, parseInt(e.target.value)); setDate(format(d, 'yyyy-MM-dd')); return d; }); };
  const handleLogout = async () => { await signOut(auth); navigate('/auth'); };

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const handleNavTo = (path) => { setMobileMenuOpen(false); navigate(path); };

  // CSV Export
  const exportToCsv = () => {
      const dataToExport = filteredTransactions;
      if (dataToExport.length === 0) { alert("Nessuna transazione da esportare."); return; }
      const header = ['Data', 'Descrizione', 'Categoria', 'Metodo', 'Tipo', 'Importo'];
      const csvContent = [ header.join(','), ...dataToExport.map(row => [ new Date(row.date).toLocaleDateString('it-IT'), `"${(row.description || '').replace(/"/g, '""')}"`, `"${(row.category || '').replace(/"/g, '""')}"`, `"${(row.paymentMethod || '').replace(/"/g, '""')}"`, row.type === 'income' ? 'Entrata' : 'Uscita', row.amount.toFixed(2) ].join(',')) ].join('\n');
      const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `BudgetBuddy_${format(currentDate, 'yyyy_MM')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const filteredTransactions = useMemo(() => {
      return transactions.filter(t => {
          const matchesType = filterType === 'all' ? true : t.type === filterType;
          const matchesCategory = filterCategory === 'all' ? true : t.category === filterCategory;
          return matchesType && matchesCategory;
      });
  }, [transactions, filterType, filterCategory]);

  const availableCategories = useMemo(() => {
      const cats = new Set(transactions.map(t => t.category).filter(Boolean));
      return Array.from(cats).sort();
  }, [transactions]);

  // Form Helpers
  const resetForm = () => { setDescription(''); setAmount(''); setCategory(''); setAccountId(''); setToAccountId(''); setType('expense'); setIsRecurring(false); setRecurrenceRule(null); setRecurrenceEndDate(null); setShowRecurringModal(false); };
  const cancelRecurrence = () => { setIsRecurring(false); setRecurrenceRule(null); setRecurrenceEndDate(null); };
  const handleRecurringSettingsSubmit = (e) => { e.preventDefault(); const interval = document.getElementById('recurrence-interval').value; const unit = document.getElementById('recurrence-unit').value; const rule = `FREQ=${unit};INTERVAL=${interval}`; const endDate = document.getElementById('recurrence-end-date').value || null; setRecurrenceRule(rule); setRecurrenceEndDate(endDate); setIsRecurring(true); setShowRecurringModal(false); };
  const handleAiSuggest = async () => { if (!description) return; setIsAiLoading(true); try { const s = await getSmartCategorization(description, suggestedCategories); if(s) { setCategory(s.category); setType(s.type); } } catch(e){} finally { setIsAiLoading(false); } };
  const handleDuplicateClick = (t) => { setDescription(t.description); setAmount(t.amount); setCategory(t.category); setAccountId(t.accountId || ''); setType(t.type); setDate(format(new Date(), 'yyyy-MM-dd')); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  // --- ADD TRANSACTION (ATOMIC - FIXED) ---
  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!user) return;
    if (!accountId) { alert("Seleziona un conto!"); return; }
    if (type === 'transfer' && !toAccountId) { alert("Destinazione?"); return; }

    const valAmount = parseFloat(amount);
    const sourceAcc = accounts.find(a => a.id === accountId);
    const destAcc = accounts.find(a => a.id === toAccountId);
    const paymentMethodName = sourceAcc ? sourceAcc.name : 'Conto';

    // 1. CHECK BUDGET
    if (type === 'expense' && category) {
        const relevantBudget = budgets.find(b => b.category.toLowerCase() === category.toLowerCase());
        if (relevantBudget) {
            const currentSpent = transactions.filter(t => t.type === 'expense' && t.category.toLowerCase() === category.toLowerCase()).reduce((sum, t) => sum + t.amount, 0);
            if (currentSpent + valAmount > relevantBudget.limit) {
                if (!window.confirm(`⚠️ BUDGET SFORATO!\nProcedere?`)) return;
            }
        }
    }
    // 2. CHECK PLAFOND
    if (sourceAcc && sourceAcc.type === 'credit' && sourceAcc.creditLimit && type !== 'income') {
        if (Math.abs(sourceAcc.balance) + valAmount > sourceAcc.creditLimit) {
            if (!window.confirm(`⛔️ PLAFOND ESAURITO!\nForzare?`)) return;
        }
    }
    // 3. CHECK LIQUIDITÀ
    if ((type === 'expense' || type === 'transfer') && sourceAcc && sourceAcc.type !== 'credit') {
        const avail = sourceAcc.type === 'investment' ? (sourceAcc.cash || 0) : sourceAcc.balance;
        if (avail - valAmount < 0) {
             if (!window.confirm(`⚠️ ATTENZIONE LIQUIDITÀ!\nIl conto andrà in rosso.\nProcedere?`)) return;
        }
    }

    const isFuture = date > format(new Date(), 'yyyy-MM-dd');
    const status = isFuture ? 'scheduled' : 'completed';

    try {
        await runTransaction(db, async (transaction) => {
            const sourceRef = doc(db, 'accounts', accountId); 
            const destRef = (type === 'transfer' && toAccountId) ? doc(db, 'accounts', toAccountId) : null;
            
            // 1. READ ALL
            const sourceDoc = await transaction.get(sourceRef);
            const destDoc = destRef ? await transaction.get(destRef) : null;

            // 2. WRITE ALL
            if (!isFuture) {
                if (!sourceDoc.exists()) throw "Source missing";
                const sData = sourceDoc.data();
                const sBal = sData.balance || 0; 
                const sCash = (sData.cash !== undefined) ? sData.cash : sBal;

                // FIX: Calcolo del delta E APPLICAZIONE del delta
                const delta = (type === 'expense' || type === 'transfer') ? -valAmount : valAmount;
                const newSBal = sBal + delta;
                const newSCash = sCash + delta;
                
                // Aggiorna il conto sorgente con i NUOVI valori
                transaction.update(sourceRef, { balance: newSBal, cash: newSCash });

                // Gestione Destinazione (solo per Giroconto)
                if (destDoc) {
                    if (!destDoc.exists()) throw "Dest missing";
                    const dData = destDoc.data();
                    const dBal = dData.balance || 0;
                    const dCash = (dData.cash !== undefined) ? dData.cash : dBal;
                    // Transfer verso dest è sempre entrata (+)
                    transaction.update(destRef, { balance: dBal + valAmount, cash: dCash + valAmount });
                }
            }

            const newTransRef = doc(collection(db, 'transactions'));
            transaction.set(newTransRef, { 
                userId: user.uid, description: type === 'transfer' ? `Trasferimento a ${destAcc?.name}` : description, 
                amount: valAmount, date, type, category: type === 'transfer' ? 'Trasferimento' : category, 
                accountId, toAccountId: type === 'transfer' ? toAccountId : null, 
                paymentMethod: paymentMethodName, 
                isRecurring, recurrenceRule: recurrenceRule || null, recurrenceEndDate: recurrenceEndDate || null, isVirtual: false,
                status: status 
            });
        });
        resetForm(); refetch(); 
        if (isFuture) alert("Transazione programmata.");
    } catch (error) { console.error("Errore:", error); alert("Errore salvataggio: " + error.message); }
  };

  // --- DELETE TRANSACTION ---
  const handleDeleteClick = async (t) => {
      if (!window.confirm('Eliminare?')) return;
      try {
          const shouldRestore = !t.isVirtual && t.accountId && (t.status !== 'scheduled');
          if (shouldRestore) {
              await runTransaction(db, async (transaction) => {
                  const sourceRef = doc(db, 'accounts', t.accountId);
                  let destRef = null;
                  if (t.type === 'transfer' && t.toAccountId) destRef = doc(db, 'accounts', t.toAccountId);
                  
                  const sourceDoc = await transaction.get(sourceRef);
                  const destDoc = destRef ? await transaction.get(destRef) : null;

                  // Ripristino Sorgente (Inverso dell'operazione originale)
                  if (sourceDoc.exists()) {
                      const sData = sourceDoc.data();
                      const sBal = sData.balance;
                      const sCash = (sData.cash !== undefined) ? sData.cash : sBal;
                      
                      // Se era expense/transfer (ho tolto soldi), ora devo aggiungerli (+ amount)
                      // Se era income (ho aggiunto soldi), ora devo toglierli (- amount)
                      const delta = (t.type === 'expense' || t.type === 'transfer') ? t.amount : -t.amount;
                      
                      transaction.update(sourceRef, { balance: sBal + delta, cash: sCash + delta });
                  }

                  // Ripristino Destinazione (Solo per Transfer: tolgo i soldi ricevuti)
                  if (destDoc && destDoc.exists()) {
                      const dData = destDoc.data();
                      const dBal = dData.balance;
                      const dCash = (dData.cash !== undefined) ? dData.cash : dBal;
                      transaction.update(destRef, { balance: dBal - t.amount, cash: dCash - t.amount });
                  }
                  transaction.delete(doc(db, 'transactions', t.id));
              });
          } else {
              if (t.isVirtual) await addDoc(collection(db, 'exceptions'), { userId: user.uid, originalTransactionId: t.originalId, exceptionDate: t.date });
              else await deleteDoc(doc(db, 'transactions', t.id));
          }
          refetch();
      } catch (e) { console.error(e); alert("Errore eliminazione"); }
  };

  const handleEditClick = (t) => { setEditingTransaction(t); if (t.isVirtual) setEditMode('modify-occurrence'); else if (t.isRecurring) setEditMode('modify-series'); else setEditMode('edit'); setShowEditModal(true); };
  const handleEditSubmit = async (mode, t, newData) => { setShowEditModal(false); const ref = doc(db, 'transactions', t.originalId || t.id); try { if (newData.makeRecurring) await updateDoc(ref, { ...newData, isRecurring:true, recurrenceRule:newData.recurrenceRule, recurrenceEndDate:null }); else if (mode === 'edit') await updateDoc(ref, { ...newData, amount: parseFloat(newData.amount) }); else if (mode === 'modify-occurrence') { await addDoc(collection(db, 'exceptions'), { userId:user.uid, originalTransactionId:t.originalId||t.id, exceptionDate:t.date }); await addDoc(collection(db, 'transactions'), { ...newData, userId:user.uid, amount:parseFloat(newData.amount), isRecurring:false, isVirtual:false, isModifiedOccurrence:true, status: 'completed' }); } else if (mode === 'modify-series') await updateDoc(ref, { ...newData, amount: parseFloat(newData.amount) }); else if (mode === 'terminate-series') await updateDoc(ref, { recurrenceEndDate:newData.date }); else if (mode === 'convert-to-single') { if(t.isVirtual) { await deleteDoc(ref); await addDoc(collection(db, 'transactions'), { ...newData, userId:user.uid, amount:parseFloat(newData.amount), isRecurring:false, isVirtual:false, status: 'completed' }); } else await updateDoc(ref, { ...newData, amount:parseFloat(newData.amount), isRecurring:false, recurrenceRule:null, recurrenceEndDate:null }); } setEditingTransaction(null); setEditMode(null); refetch(); } catch (e) { console.error(e); } };

  const totalIncome = transactions.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : 0), 0);
  const totalExpense = transactions.reduce((sum, t) => sum + (t.type === 'expense' ? t.amount : 0), 0);
  const balance = totalIncome - totalExpense;

  const monthlyInvestedBuy = transactions.filter(t => t.type === 'expense' && t.category === 'Investimenti').reduce((sum, t) => sum + t.amount, 0);
  const monthlyInvestedSell = transactions.filter(t => t.type === 'income' && t.category === 'Investimenti').reduce((sum, t) => sum + t.amount, 0);
  const monthlyInvestedNet = monthlyInvestedBuy - monthlyInvestedSell;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-10">
      <datalist id="category-list">{suggestedCategories.map((cat, index) => <option key={index} value={cat} />)}</datalist>
      
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 rounded-lg p-1.5">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <h1 className="text-xl font-bold">BudgetBuddy</h1>
          </div>

          {/* Desktop links */}
          <div className="hidden md:flex items-center space-x-6">
            <button onClick={() => navigate('/summary')} className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition">Report Annuale</button>
            <button onClick={() => navigate('/planning')} className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition">Pianificazione</button>
            <div className="h-4 w-px bg-slate-200" />
            <button onClick={() => navigate('/investments')} className="flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600 transition group"><span className="bg-emerald-100 p-1 rounded-full group-hover:bg-emerald-200"><svg className="w-5 h-5 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg></span><span className="font-semibold text-emerald-700">Investimenti</span></button>
            <div className="h-4 w-px bg-slate-200" />
            <button onClick={() => navigate('/profile')} className="flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600 transition group"><span className="bg-slate-100 p-1 rounded-full group-hover:bg-indigo-50"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg></span><span>Ciao, <strong className="font-semibold">{displayName}</strong></span></button>
            <button onClick={handleLogout} className="text-sm font-medium text-rose-600 hover:text-rose-700 transition border border-rose-100 bg-rose-50 px-3 py-1.5 rounded-lg hover:bg-rose-100">Logout</button>
          </div>

          {/* Mobile hamburger */}
          <button onClick={() => setMobileMenuOpen(o => !o)} className="md:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition">
            {mobileMenuOpen
              ? <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              : <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
            }
          </button>
        </div>

        {/* Mobile drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-100 bg-white px-4 py-3 flex flex-col gap-1">
            <button onClick={() => handleNavTo('/')} className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition text-left">
              <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
              Dashboard
            </button>
            <button onClick={() => handleNavTo('/summary')} className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition text-left">
              <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
              Report Annuale
            </button>
            <button onClick={() => handleNavTo('/planning')} className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition text-left">
              <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              Pianificazione
            </button>
            <button onClick={() => handleNavTo('/investments')} className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition text-left">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
              Investimenti
            </button>
            <div className="h-px bg-slate-100 my-1" />
            <button onClick={() => handleNavTo('/profile')} className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition text-left">
              <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
              Profilo — <span className="text-slate-400 ml-1">{displayName}</span>
            </button>
            <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 transition text-left">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
              Logout
            </button>
          </div>
        )}
      </nav>

      <div className="max-w-7xl mx-auto px-4 mt-8">
        
        {/* ACTION BAR: NAVIGAZIONE + LIQUIDITÀ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            
            {/* SX: SELETTORE DATA */}
            <div className="bg-white px-5 py-3 rounded-xl shadow-sm border border-slate-200 flex items-center gap-3">
                <div className="bg-indigo-50 text-indigo-600 p-2 rounded-lg">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                </div>
                <div className="flex items-center gap-2 flex-1">
                    <select 
                        value={currentDate.getMonth()} 
                        onChange={handleMonthChange} 
                        className="bg-transparent text-slate-700 text-sm font-bold p-1 focus:outline-none cursor-pointer hover:text-indigo-600 flex-1"
                    >
                        {MONTHS_IT.map((m, i) => <option key={i} value={i}>{m}</option>)}
                    </select>
                    <div className="h-4 w-px bg-slate-200"></div>
                    <select 
                        value={currentDate.getFullYear()} 
                        onChange={handleYearChange} 
                        className="bg-transparent text-slate-700 text-sm font-bold p-1 focus:outline-none cursor-pointer hover:text-indigo-600"
                    >
                        {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
            </div>

            {/* DX: WALLET INFO */}
            <div className="bg-white px-5 py-3 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="bg-emerald-50 text-emerald-600 p-2 rounded-lg">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-1">Liquidità Disponibile</p>
                        <p className="text-xl font-bold text-slate-800 leading-none">{formatCurrency(totalLiquidity)}</p>
                    </div>
                </div>
                <div className="hidden sm:block text-right">
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Patrimonio Totale</p>
                    <p className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-md inline-block">{formatCurrency(realTotalNetWorth)}</p>
                </div>
            </div>
        </div>

        {/* KPI MENSILI */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"><p className="text-xs font-bold text-slate-400 uppercase">Entrate Mese</p><p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalIncome)}</p></div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"><p className="text-xs font-bold text-slate-400 uppercase">Uscite Mese</p><p className="text-2xl font-bold text-rose-600">{formatCurrency(totalExpense)}</p></div>
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"><p className="text-xs font-bold text-slate-400 uppercase">Investiti (Netto)</p><p className={`text-2xl font-bold ${monthlyInvestedNet >= 0 ? 'text-indigo-600' : 'text-rose-500'}`}>{formatCurrency(monthlyInvestedNet)}</p></div>
            <div className={`p-5 rounded-2xl shadow-md text-white bg-gradient-to-br ${balance >= 0 ? 'from-indigo-600 to-blue-500' : 'from-orange-500 to-red-500'}`}><p className="text-xs font-bold opacity-80 uppercase">Flusso Netto</p><p className="text-2xl font-bold">{formatCurrency(balance)}</p></div>
        </div>

        <FinancialInsights accounts={accounts} transactions={transactions} budgets={budgets} goals={goals} />

        {/* GRID FORM + LISTA */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start mt-8">
            {/* COLONNA 1: FORM */}
            <div className="lg:col-span-1">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 sticky top-24">
                    <div className="flex justify-between items-center mb-6"><h3 className="text-lg font-bold">Nuova Transazione</h3><button type="button" onClick={() => setShowRecurringModal(true)} className={`p-2 rounded-lg ${isRecurring ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400 hover:bg-slate-50'}`}><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button></div>
                    <form onSubmit={handleAddTransaction} className="space-y-4">
                        <div className="flex bg-slate-100 p-1 rounded-xl"><button type="button" onClick={() => setType('expense')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${type === 'expense' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}>USCITA</button><button type="button" onClick={() => setType('income')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${type === 'income' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}>ENTRATA</button><button type="button" onClick={() => setType('transfer')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${type === 'transfer' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>GIROCONTO</button></div>
                        <input type="number" step="0.01" placeholder="0.00 €" required value={amount} onChange={e => setAmount(e.target.value)} className="w-full text-center text-3xl font-bold py-4 border-b-2 bg-transparent outline-none focus:border-indigo-500" />
                        <div className="relative"><input type="text" placeholder={type === 'transfer' ? 'Note opzionali' : 'Descrizione'} value={description} onChange={e => setDescription(e.target.value)} className="input-field pr-12" required={type !== 'transfer'} />{type !== 'transfer' && (<button type="button" onClick={handleAiSuggest} disabled={isAiLoading || !description} className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all ${isAiLoading ? 'bg-indigo-100 text-indigo-400 animate-pulse' : 'text-indigo-500 hover:bg-indigo-50 hover:text-indigo-700'}`}><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></button>)}</div>
                        <div className="grid grid-cols-2 gap-3">{type !== 'transfer' && <input type="text" placeholder="Categoria" required value={category} onChange={e => setCategory(e.target.value)} className="input-field" list="category-list" />}<input type="date" required value={date} onChange={e => setDate(e.target.value)} className={`input-field ${type === 'transfer' ? 'col-span-2' : ''}`} /></div>
                        
                        <div className="space-y-3">
                            {accounts.length > 0 ? (
                                <select value={accountId} onChange={e => setAccountId(e.target.value)} className="input-field appearance-none cursor-pointer" required>
                                    <option value="" disabled>{type === 'transfer' ? 'DA Conto...' : 'Conto'}</option>
                                    {accounts.filter(a => a.status !== 'closed').map(acc => (<option key={acc.id} value={acc.id}>{acc.name} ({formatCurrency(acc.type === 'investment' ? (acc.cash || 0) : acc.balance)})</option>))}
                                </select>
                            ) : (
                                <div onClick={() => navigate('/profile')} className="p-3 border border-dashed border-rose-300 bg-rose-50 text-rose-600 rounded-xl text-center text-xs cursor-pointer font-bold">Nessun conto attivo. <br/>Clicca per crearne uno nel Profilo.</div>
                            )}
                            {type === 'transfer' && (<select value={toAccountId} onChange={e => setToAccountId(e.target.value)} className="input-field appearance-none cursor-pointer" required><option value="" disabled>A Conto...</option>{accounts.filter(a => a.id !== accountId && a.status !== 'closed').map(acc => (<option key={acc.id} value={acc.id}>{acc.name} ({formatCurrency(acc.type === 'investment' ? (acc.cash || 0) : acc.balance)})</option>))}</select>)}
                        </div>

                        {isRecurring && (<div className="bg-indigo-50 text-indigo-700 text-xs px-3 py-2 rounded-lg border border-indigo-100 font-bold flex items-center justify-between animate-fadeIn"><div className="flex items-center gap-2"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>{formatRecurrenceLabel(recurrenceRule)}</div><button type="button" onClick={cancelRecurrence} className="text-indigo-400 hover:text-rose-500 transition rounded-full p-1 hover:bg-white/50"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button></div>)}
                        <button type="submit" disabled={accounts.length === 0} className="btn-primary mt-2 disabled:opacity-50 disabled:cursor-not-allowed">{type === 'transfer' ? 'Esegui Giroconto' : 'Aggiungi'}</button>
                    </form>
                </div>
            </div>

            {/* COLONNA 2: LISTA */}
            <div className="lg:col-span-2">
                <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col transition-all duration-300 ease-in-out ${isRecurring ? 'h-[580px]' : 'h-[520px]'}`}>
                    <div className="px-6 py-4 border-b border-slate-50 flex flex-wrap gap-4 justify-between items-center bg-slate-50/50 flex-none sticky top-0 z-10">
                        <h3 className="font-bold text-slate-800">Storico Movimenti</h3>
                        <div className="flex gap-2">
                            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="input-field py-1 text-xs w-auto bg-white border-slate-200"><option value="all">Tutti i tipi</option><option value="expense">Uscite</option><option value="income">Entrate</option></select>
                            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="input-field py-1 text-xs w-auto bg-white border-slate-200 max-w-[150px]"><option value="all">Tutte le categorie</option>{availableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select>
                            <button onClick={exportToCsv} className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-indigo-100 transition" title="Esporta filtrati"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <ul className="divide-y divide-slate-50">
                            {filteredTransactions.map(t => {
                                const isScheduled = t.status === 'scheduled';
                                return (
                                    <li key={t.id} className={`group hover:bg-slate-50 p-4 flex items-center justify-between transition-colors ${isScheduled ? 'opacity-60 bg-slate-50/50' : ''}`}>
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${t.type === 'income' ? 'bg-emerald-100 text-emerald-600' : t.type === 'transfer' ? 'bg-blue-100 text-blue-600' : 'bg-rose-100 text-rose-600'}`}>{t.type === 'income' ? '↓' : t.type === 'transfer' ? '⇄' : '↑'}</div>
                                            <div><div className="flex items-center gap-2"><p className="font-semibold text-slate-700">{t.description}</p>{(t.isRecurring || t.isVirtual || t.isModifiedOccurrence) && <span className="text-xs font-bold text-indigo-500 bg-indigo-50 px-1 rounded">R</span>}{isScheduled && <span className="text-xs font-bold text-amber-500 bg-amber-50 px-1 rounded border border-amber-200">Futura</span>}</div><p className="text-sm text-slate-400">{format(new Date(t.date), 'dd MMM')} • {t.category}</p></div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right"><span className={`font-mono font-bold text-lg block ${t.type === 'income' ? 'text-emerald-600' : t.type === 'transfer' ? 'text-slate-600' : 'text-slate-800'}`}>{t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''} {formatCurrency(t.amount)}</span><span className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">{t.paymentMethod}</span></div>
                                            <div className="opacity-0 group-hover:opacity-100 flex gap-2 transition-opacity">
                                                <button onClick={() => handleDuplicateClick(t)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg shadow-sm border border-transparent hover:border-slate-100 transition" title="Duplica"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5" /></svg></button>
                                                <button onClick={() => handleEditClick(t)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg shadow-sm border border-transparent hover:border-slate-100 transition" title="Modifica"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg></button>
                                                <button onClick={() => handleDeleteClick(t)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg shadow-sm border border-transparent hover:border-slate-100 transition" title="Elimina"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg></button>
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                            {filteredTransactions.length === 0 && <p className="text-center py-10 text-slate-400 italic text-sm">Nessun movimento trovato.</p>}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
      </div>
      
      {showRecurringModal && (<div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50"><div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-sm"><h2 className="text-lg font-bold text-slate-800 mb-4 text-center">Imposta Ricorrenza</h2><form onSubmit={handleRecurringSettingsSubmit} className="space-y-4"><div className="flex items-center space-x-2"><label className="text-sm font-medium">Ripeti ogni</label><input type="number" id="recurrence-interval" min="1" defaultValue="1" className="w-16 p-2 border rounded-lg text-center" required /><select id="recurrence-unit" className="flex-grow p-2 border rounded-lg"><option value="DAILY">Giorno/i</option><option value="WEEKLY">Settimana/e</option><option value="MONTHLY">Mese/i</option><option value="YEARLY">Anno/i</option></select></div><div><label className="block text-sm font-medium mb-1">Data fine (opzionale)</label><input type="date" id="recurrence-end-date" className="input-field" /></div><div className="flex justify-end gap-2 mt-4"><button type="button" onClick={() => setShowRecurringModal(false)} className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100">Annulla</button><button type="submit" className="btn-primary py-2 px-4">Conferma</button></div></form></div></div>)}
      {showEditModal && editingTransaction && (<EditModal t={editingTransaction} mode={editMode} onClose={() => { setShowEditModal(false); setEditingTransaction(null); }} onSubmit={handleEditSubmit} suggestedCategories={suggestedCategories} accounts={accounts} />)}
    </div>
  );
}

export default Dashboard;