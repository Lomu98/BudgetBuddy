import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebaseConfig';
import { signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAnnualSummary } from '../hooks/useAnnualSummary';
import { useAccounts } from '../hooks/useAccounts'; 
import { getForexRates } from '../utils/financeService';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, BarElement, Filler } from 'chart.js';
import { format } from 'date-fns';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, BarElement, Filler);

// 1. PALETTE GENERICA
const CATEGORY_PALETTE = [
    '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', 
    '#06B6D4', '#84CC16', '#6366F1', '#F97316', '#14B8A6', '#64748B'
];

// 2. MAPPA COLORI CONTI
const ACCOUNT_HEX_MAP = {
    slate: '#475569', gray: '#4b5563', zinc: '#52525b', neutral: '#525252', stone: '#57534e',
    red: '#dc2626', orange: '#f97316', amber: '#f59e0b', yellow: '#eab308', lime: '#65a30d',
    green: '#16a34a', emerald: '#059669', teal: '#0d9488', cyan: '#0891b2', sky: '#0284c7',
    blue: '#2563eb', indigo: '#4f46e5', violet: '#7c3aed', purple: '#9333ea', fuchsia: '#c026d3',
    pink: '#db2777', rose: '#e11d48', navy: '#1e3a8a', forest: '#064e3b', onyx: '#0f172a',
    ivory: '#78716c', gold: '#ca8a04'
};

const getYearOptions = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = 2020; i <= currentYear; i++) years.push(i);
    return years.reverse();
};

const formatCurrency = (amount) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);

function AnnualSummary() {
    const navigate = useNavigate();
    const user = auth.currentUser;
    const displayName = user?.displayName || user?.email;

    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    
    // Hooks dati
    const { data, loading } = useAnnualSummary(user?.uid, currentYear);
    const { accounts } = useAccounts(user?.uid); 

    // Stati per calcolo Patrimonio Investito (Globale)
    const [assets, setAssets] = useState([]);
    const [exchangeRates, setExchangeRates] = useState(null);
    
    // Stati UI
    const [monthlyTrendType, setMonthlyTrendType] = useState('all');
    const [breakdownBy, setBreakdownBy] = useState('category'); 
    const [breakdownType, setBreakdownType] = useState('expense');
    const [chartView, setChartView] = useState('bar');

    // Fetch Assets & Forex per header
    useEffect(() => {
        if (!user) return;
        const qA = query(collection(db, 'assets'), where('userId', '==', user.uid));
        const unsubA = onSnapshot(qA, (snap) => setAssets(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        getForexRates().then(setExchangeRates);
        return () => unsubA();
    }, [user]);

    // --- CALCOLI PATRIMONIALI (Uniformati) ---
    const convertToEur = (price, currency) => {
        if (currency === 'EUR') return price;
        if (!exchangeRates || !exchangeRates[currency]) return price; 
        return price / exchangeRates[currency];
    };

    // 1. Calcolo Liquidità Reale (Somma diretta)
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

    // 2. Investito (Valore Mercato Attuale)
    const investedMarketValue = useMemo(() => {
        return assets.reduce((sum, asset) => {
            const qty = parseFloat(asset.quantity) || 0;
            const price = parseFloat(asset.currentPrice) || 0;
            return sum + (qty * convertToEur(price, asset.currency || 'EUR'));
        }, 0);
    }, [assets, exchangeRates]);

    // 3. Patrimonio Netto Reale
    const realTotalNetWorth = totalLiquidity + investedMarketValue;

    if (loading || !data) {
        return <div className="min-h-screen flex items-center justify-center text-slate-400 bg-slate-50 font-sans">Caricamento analisi...</div>;
    }

    const { totalIncome, totalExpense, monthlyIncome, monthlyExpense, incomeByCategory, expenseByCategory, allTransactions, prevTotalIncome, prevTotalExpense } = data;
    const balance = totalIncome - totalExpense;
    
    // Calcolo Investimenti nell'anno (Flow - spesa per investimenti)
    const yearlyInvestedFlow = allTransactions
        .filter(t => t.type === 'expense' && t.category === 'Investimenti')
        .reduce((sum, t) => sum + t.amount, 0);

    // AGGREGAZIONE METODI
    const expenseByMethod = {};
    const incomeByMethod = {};
    
    allTransactions.forEach(t => {
        if (t.type === 'transfer') return;
        const method = t.paymentMethod || 'Sconosciuto';
        if (t.type === 'expense') expenseByMethod[method] = (expenseByMethod[method] || 0) + t.amount;
        else if (t.type === 'income') incomeByMethod[method] = (incomeByMethod[method] || 0) + t.amount;
    });

    const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

    const calculateYoY = (current, previous) => {
        if (!previous) return null;
        const diff = current - previous;
        const percent = (diff / previous) * 100;
        return { diff, percent };
    };
    const incomeYoY = calculateYoY(totalIncome, prevTotalIncome);
    const expenseYoY = calculateYoY(totalExpense, prevTotalExpense);

    const handleLogout = async () => { await signOut(auth); navigate('/auth'); };

    const exportToCsv = () => {
         if (allTransactions.length === 0) { alert("Nessuna transazione."); return; }
         const header = ['Data', 'Descrizione', 'Categoria', 'Metodo', 'Tipo', 'Importo'];
         const csvContent = [ header.join(','), ...allTransactions.map(row => [ new Date(row.date).toLocaleDateString('it-IT'), `"${(row.description || '').replace(/"/g, '""')}"`, `"${(row.category || '').replace(/"/g, '""')}"`, `"${(row.paymentMethod || '').replace(/"/g, '""')}"`, row.type === 'income' ? 'Entrata' : 'Uscita', row.amount.toFixed(2) ].join(',')) ].join('\n');
         const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
         const link = document.createElement('a');
         const url = URL.createObjectURL(blob);
         link.setAttribute('href', url);
         link.setAttribute('download', `BudgetBuddy_Anno_${currentYear}.csv`);
         link.style.visibility = 'hidden';
         document.body.appendChild(link);
         link.click();
         document.body.removeChild(link);
    };

    // Trend Data
    const monthlyTrendData = {
        labels: months,
        datasets: [
            ...(monthlyTrendType === 'all' || monthlyTrendType === 'income' ? [{ label: 'Entrate', data: monthlyIncome, borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.4, pointRadius: 4 }] : []),
            ...(monthlyTrendType === 'all' || monthlyTrendType === 'expense' ? [{ label: 'Uscite', data: monthlyExpense, borderColor: '#F43F5E', backgroundColor: 'rgba(244, 63, 94, 0.1)', fill: true, tension: 0.4, pointRadius: 4 }] : []),
        ],
    };

    // Breakdown Data Logic
    let activeDataMap = {};
    let chartColors = [];

    if (breakdownBy === 'category') {
        activeDataMap = breakdownType === 'expense' ? expenseByCategory : incomeByCategory;
        const labels = Object.keys(activeDataMap);
        chartColors = labels.map((_, i) => CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]);
    } else {
        activeDataMap = breakdownType === 'expense' ? expenseByMethod : incomeByMethod;
        const labels = Object.keys(activeDataMap);
        chartColors = labels.map((methodName) => {
            const account = (accounts || []).find(a => a.name === methodName);
            if (account && account.color && ACCOUNT_HEX_MAP[account.color]) {
                return ACCOUNT_HEX_MAP[account.color];
            }
            return '#9CA3AF'; // Fallback Grigio
        });
    }

    const breakdownChartConfig = {
        labels: Object.keys(activeDataMap),
        datasets: [{ label: 'Importo', data: Object.values(activeDataMap), backgroundColor: chartColors, borderColor: 'white', borderWidth: 2, borderRadius: 4 }]
    };

    const commonOptions = { responsive: true, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20, font: { family: "'Inter', sans-serif" } } } }, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { callback: value => value + ' €', font: { family: "'Inter', sans-serif" } } }, x: { grid: { display: false }, ticks: { font: { family: "'Inter', sans-serif" } } } } };
    const barOptions = { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { callback: value => value + ' €', font: { family: "'Inter', sans-serif" } } }, x: { grid: { display: false }, ticks: { font: { family: "'Inter', sans-serif" } } } } };
    const pieOptions = { responsive: true, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20, font: { family: "'Inter', sans-serif" } } } } };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-10">
            
            <nav className="bg-white border-b border-slate-200 sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
                    <div className="flex items-center gap-2"><div className="bg-indigo-600 rounded-lg p-1.5"><svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg></div><h1 className="text-xl font-bold">Report Annuale</h1></div>
                    <div className="flex items-center space-x-6">
                        <button onClick={() => navigate('/')} className="hidden md:block text-sm font-medium text-slate-500 hover:text-indigo-600 transition">Vista Mensile</button>
                        <button onClick={() => navigate('/planning')} className="hidden md:block text-sm font-medium text-slate-500 hover:text-indigo-600 transition">Pianificazione</button>
                        <div className="h-4 w-px bg-slate-200 hidden md:block"></div>
                        <button onClick={() => navigate('/investments')} className="hidden md:flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600 transition group"><span className="bg-emerald-100 p-1 rounded-full group-hover:bg-emerald-200"><svg className="w-5 h-5 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg></span><span className="font-semibold text-emerald-700">Investimenti</span></button>
                        <div className="h-4 w-px bg-slate-200 hidden md:block"></div>
                        <button onClick={() => navigate('/profile')} className="hidden md:flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600 transition group"><span className="bg-slate-100 p-1 rounded-full group-hover:bg-indigo-50"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></span><span>Ciao, <strong className="font-semibold">{displayName}</strong></span></button>
                        <button onClick={handleLogout} className="text-sm font-medium text-rose-600 hover:text-rose-700 transition border border-rose-100 bg-rose-50 px-3 py-1.5 rounded-lg hover:bg-rose-100">Logout</button>
                    </div>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto px-4 mt-8">
                
                {/* ACTION BAR: SELECTOR ANNO (Drop-down) + LIQUIDITÀ (Style uniformato) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    
                    {/* SX: SELETTORE ANNO */}
                    <div className="bg-white px-5 py-3 rounded-xl shadow-sm border border-slate-200 flex items-center gap-3">
                        <div className="bg-indigo-50 text-indigo-600 p-2 rounded-lg">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </div>
                        <div className="flex-1">
                            <select 
                                value={currentYear} 
                                onChange={(e) => setCurrentYear(parseInt(e.target.value))} 
                                className="w-full bg-transparent text-slate-700 text-sm font-bold p-1 focus:outline-none cursor-pointer hover:text-indigo-600"
                            >
                                {getYearOptions().map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* DX: WALLET INFO (Con Badge Patrimonio) */}
                    <div className="bg-white px-5 py-3 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="bg-emerald-50 text-emerald-600 p-2 rounded-lg">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-1">Liquidità Disponibile</p>
                                <p className="text-xl font-bold text-slate-800 leading-none">{formatCurrency(totalLiquidity)}</p>
                            </div>
                        </div>
                        {/* Badge Patrimonio Totale REALE */}
                        <div className="hidden sm:block text-right">
                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-0.5">Patrimonio Totale</p>
                            <p className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-md inline-block">{formatCurrency(realTotalNetWorth)}</p>
                        </div>
                    </div>
                </div>

                {/* KPI CARDS (4 Colonne) */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><div className="flex justify-between items-start"><p className="text-sm font-medium text-slate-400 uppercase">Entrate Totali</p>{incomeYoY && (<span className={`text-xs font-bold px-2 py-1 rounded-full ${incomeYoY.percent >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{incomeYoY.percent >= 0 ? '+' : ''}{incomeYoY.percent.toFixed(1)}%</span>)}</div><p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(totalIncome)}</p></div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><div className="flex justify-between items-start"><p className="text-sm font-medium text-slate-400 uppercase">Uscite Totali</p>{expenseYoY && (<span className={`text-xs font-bold px-2 py-1 rounded-full ${expenseYoY.percent <= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{expenseYoY.percent > 0 ? '+' : ''}{expenseYoY.percent.toFixed(1)}%</span>)}</div><p className="text-2xl font-bold text-rose-600 mt-1">{formatCurrency(totalExpense)}</p></div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><p className="text-sm font-medium text-slate-400 uppercase">Investiti (Anno)</p><p className="text-2xl font-bold text-indigo-600 mt-1">{formatCurrency(yearlyInvestedFlow)}</p></div>
                    <div className={`p-6 rounded-2xl shadow-md text-white bg-gradient-to-br ${balance >= 0 ? 'from-indigo-600 to-blue-500' : 'from-orange-500 to-red-500'}`}><p className="text-sm font-medium opacity-80 uppercase">Saldo Annuale</p><p className="text-3xl font-bold mt-1">{formatCurrency(balance)}</p></div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    {/* TREND */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"><div className="flex justify-between items-center mb-6"><h3 className="font-bold text-slate-800">Andamento Mensile</h3><div className="flex bg-slate-100 p-1 rounded-lg">{['all', 'income', 'expense'].map(mode => (<button key={mode} onClick={() => setMonthlyTrendType(mode)} className={`px-3 py-1 text-xs font-medium rounded-md transition ${monthlyTrendType === mode ? 'bg-white shadow text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>{mode === 'all' ? 'Tutto' : mode === 'income' ? 'Entrate' : 'Uscite'}</button>))}</div></div><div className="h-64"><Line data={monthlyTrendData} options={commonOptions} /></div></div>

                    {/* BREAKDOWN UNIFICATO */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
                        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                            <h3 className="font-bold text-slate-800">Analisi Dettagliata</h3>
                            <div className="flex items-center gap-2">
                                <div className="flex bg-slate-100 p-1 rounded-lg">
                                    <button onClick={() => setBreakdownBy('category')} className={`px-3 py-1 text-xs font-medium rounded-md transition ${breakdownBy === 'category' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}>Categoria</button>
                                    <button onClick={() => setBreakdownBy('method')} className={`px-3 py-1 text-xs font-medium rounded-md transition ${breakdownBy === 'method' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}>Metodo</button>
                                </div>
                                <div className="flex bg-slate-100 p-1 rounded-lg">
                                    <button onClick={() => setBreakdownType('expense')} className={`px-3 py-1 text-xs font-medium rounded-md transition ${breakdownType === 'expense' ? 'bg-white shadow text-rose-600' : 'text-slate-500'}`}>Spese</button>
                                    <button onClick={() => setBreakdownType('income')} className={`px-3 py-1 text-xs font-medium rounded-md transition ${breakdownType === 'income' ? 'bg-white shadow text-emerald-600' : 'text-slate-500'}`}>Entrate</button>
                                </div>
                                <button onClick={() => setChartView(prev => prev === 'bar' ? 'doughnut' : 'bar')} className="p-1.5 text-slate-400 hover:text-indigo-600 bg-slate-50 rounded-lg border border-slate-200" title="Cambia visualizzazione">
                                    {chartView === 'bar' ? (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>) : (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>)}
                                </button>
                            </div>
                        </div>
                        <div className="h-64 flex items-center justify-center relative">
                            {chartView === 'bar' ? <Bar data={breakdownChartConfig} options={barOptions} /> : <div className="w-64"><Doughnut data={breakdownChartConfig} options={pieOptions} /></div>}
                        </div>
                    </div>
                </div>

                {/* LISTA TRANSAZIONI */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-8 h-[600px] flex flex-col">
                    <div className="px-6 py-4 border-b border-slate-50 flex justify-between items-center bg-slate-50/50 flex-none sticky top-0 z-10">
                        <h3 className="font-bold text-slate-800">Dettaglio Movimenti {currentYear}</h3>
                        <button onClick={exportToCsv} className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-indigo-100 transition"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>Esporta CSV</button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                                <tr>
                                    <th className="py-3 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50">Data</th>
                                    <th className="py-3 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50">Descrizione</th>
                                    <th className="py-3 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50">Categoria</th>
                                    <th className="py-3 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50">Metodo</th>
                                    <th className="py-3 px-6 text-xs font-bold text-slate-500 uppercase tracking-wider text-right bg-slate-50">Importo</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {allTransactions.map(t => (
                                    <tr key={t.id} className="hover:bg-slate-50/80 transition-colors group">
                                        <td className="py-3 px-6 text-sm text-slate-500 whitespace-nowrap">{format(new Date(t.date), 'dd/MM/yyyy')}</td>
                                        <td className="py-3 px-6 text-sm font-medium text-slate-700">{t.description}</td>
                                        <td className="py-3 px-6"><span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">{t.category}</span></td>
                                        <td className="py-3 px-6 text-sm text-slate-500">{t.paymentMethod}</td>
                                        <td className={`py-3 px-6 text-sm font-bold text-right whitespace-nowrap ${
                                            t.type === 'income' ? 'text-emerald-600' : 
                                            t.type === 'transfer' ? 'text-slate-600' : 'text-rose-600'
                                        }`}>
                                            {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''} {formatCurrency(t.amount)}
                                        </td>
                                    </tr>
                                ))}
                                {allTransactions.length === 0 && (<tr><td colSpan="5" className="py-12 text-center text-slate-400">Nessun movimento registrato in questo anno.</td></tr>)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AnnualSummary;