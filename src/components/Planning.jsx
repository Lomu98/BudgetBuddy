import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, updateDoc, doc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { signOut } from 'firebase/auth';
import { useRecurringTransactions } from '../hooks/useRecurringTransactions';
import { useUserSuggestions } from '../hooks/useUserSuggestions';
import { differenceInMonths, parseISO, isFuture, getDaysInMonth, getDate } from 'date-fns';
import { getFinancialAdvice } from '../utils/aiService';

const formatCurrency = (amount) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);

const GOAL_ICONS = [ { id: 'vacation', icon: '🏖️' }, { id: 'car', icon: '🚗' }, { id: 'house', icon: '🏠' }, { id: 'tech', icon: '💻' }, { id: 'emergency', icon: '🆘' }, { id: 'wedding', icon: '💍' }, { id: 'shopping', icon: '🛍️' }, { id: 'target', icon: '🎯' } ];

function Planning() {
    const navigate = useNavigate();
    const user = auth.currentUser;
    const displayName = user?.displayName || user?.email;
    
    const [currentDate, setCurrentDate] = useState(new Date());
    const { transactions } = useRecurringTransactions(user?.uid, currentDate);
    const { categories: suggestedCategories } = useUserSuggestions(user?.uid);

    const [budgets, setBudgets] = useState([]);
    const [goals, setGoals] = useState([]);
    
    const [newBudgetCat, setNewBudgetCat] = useState('');
    const [newBudgetLimit, setNewBudgetLimit] = useState('');
    
    const [newGoalName, setNewGoalName] = useState('');
    const [newGoalTarget, setNewGoalTarget] = useState('');
    const [newGoalDate, setNewGoalDate] = useState('');
    const [newGoalIcon, setNewGoalIcon] = useState(GOAL_ICONS[0].icon);
    const [showGoalForm, setShowGoalForm] = useState(false);
    
    const [aiAdvice, setAiAdvice] = useState('');
    const [loadingAdvice, setLoadingAdvice] = useState(false);

    useEffect(() => {
        if (!user) return;
        const qBudgets = query(collection(db, 'budgets'), where('userId', '==', user.uid));
        const unsubBudgets = onSnapshot(qBudgets, (snap) => setBudgets(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        const qGoals = query(collection(db, 'goals'), where('userId', '==', user.uid));
        const unsubGoals = onSnapshot(qGoals, (snap) => setGoals(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => { unsubBudgets(); unsubGoals(); };
    }, [user]);

    useEffect(() => {
        if (transactions.length > 0 && !aiAdvice) {
            setLoadingAdvice(true);
            const income = transactions.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);
            const expense = transactions.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
            const catMap = {}; transactions.filter(t => t.type === 'expense').forEach(t => { catMap[t.category] = (catMap[t.category] || 0) + t.amount; });
            const topCategory = Object.keys(catMap).reduce((a, b) => catMap[a] > catMap[b] ? a : b, 'Nessuna');
            getFinancialAdvice({ income, expense, balance: income - expense, topCategory }).then(advice => setAiAdvice(advice)).finally(() => setLoadingAdvice(false));
        }
    }, [transactions]);

    const handleAddBudget = async (e) => { e.preventDefault(); if (!newBudgetCat || !newBudgetLimit) return; await addDoc(collection(db, 'budgets'), { userId: user.uid, category: newBudgetCat, limit: parseFloat(newBudgetLimit) }); setNewBudgetCat(''); setNewBudgetLimit(''); };
    const handleDeleteBudget = async (id) => { if (window.confirm("Eliminare budget?")) await deleteDoc(doc(db, 'budgets', id)); };
    const calculateSpent = (category) => transactions.filter(t => t.type === 'expense' && t.category.toLowerCase() === category.toLowerCase()).reduce((sum, t) => sum + t.amount, 0);
    const handleAddGoal = async (e) => { e.preventDefault(); if (!newGoalName || !newGoalTarget) return; await addDoc(collection(db, 'goals'), { userId: user.uid, name: newGoalName, target: parseFloat(newGoalTarget), current: 0, deadline: newGoalDate || null, icon: newGoalIcon }); setNewGoalName(''); setNewGoalTarget(''); setNewGoalDate(''); setShowGoalForm(false); };
    const handleDeleteGoal = async (id) => { if (window.confirm("Eliminare obiettivo?")) await deleteDoc(doc(db, 'goals', id)); };
    const handleAddSavings = async (goal, amount) => { const newCurrent = goal.current + amount; if (newCurrent < 0) return; await updateDoc(doc(db, 'goals', goal.id), { current: newCurrent }); };
    const calculatePace = (goal) => { if (!goal.deadline) return null; const deadline = parseISO(goal.deadline); if (!isFuture(deadline)) return null; const monthsLeft = differenceInMonths(deadline, new Date()) || 1; const remaining = goal.target - goal.current; return remaining <= 0 ? 0 : remaining / monthsLeft; };
    const handleLogout = async () => { await signOut(auth); navigate('/auth'); };

    const variableExpenses = transactions.filter(t => t.type === 'expense' && !t.isRecurring && !t.isVirtual).reduce((acc, t) => acc + t.amount, 0);
    const fixedExpenses = transactions.filter(t => t.type === 'expense' && (t.isRecurring || t.isVirtual)).reduce((acc, t) => acc + t.amount, 0);
    const daysInMonth = getDaysInMonth(new Date());
    const currentDay = getDate(new Date());
    const dailyAverageVariable = variableExpenses / (currentDay || 1);
    const projectedExpense = fixedExpenses + (dailyAverageVariable * daysInMonth);

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-10">
            <datalist id="category-list-plan">{suggestedCategories.map((cat, i) => <option key={i} value={cat} />)}</datalist>

            <nav className="bg-white border-b border-slate-200 sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
                    <div className="flex items-center gap-2"><div className="bg-indigo-600 rounded-lg p-1.5"><svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg></div><h1 className="text-xl font-bold">Pianificazione</h1></div>
                    
                    {/* NAVIGAZIONE AGGIORNATA */}
                    <div className="flex items-center space-x-6">
                        <button onClick={() => navigate('/')} className="hidden md:block text-sm font-medium text-slate-500 hover:text-indigo-600 transition">Vista Mensile</button>
                        <button onClick={() => navigate('/summary')} className="hidden md:block text-sm font-medium text-slate-500 hover:text-indigo-600 transition">Report Annuale</button>
                        
                        <div className="h-4 w-px bg-slate-200 hidden md:block"></div>
                        
                        <button onClick={() => navigate('/investments')} className="hidden md:flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600 transition group">
                            <span className="bg-emerald-100 p-1 rounded-full group-hover:bg-emerald-200">
                                <svg className="w-5 h-5 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                </svg>
                            </span>
                            <span className="font-semibold text-emerald-700">Investimenti</span>
                        </button>

                        <div className="h-4 w-px bg-slate-200 hidden md:block"></div>
                        
                        <button onClick={() => navigate('/profile')} className="hidden md:flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600 transition group">
                            <span className="bg-slate-100 p-1 rounded-full group-hover:bg-indigo-50">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                            </span>
                            <span>Ciao, <strong className="font-semibold">{displayName}</strong></span>
                        </button>
                        
                        <button onClick={handleLogout} className="text-sm font-medium text-rose-600 hover:text-rose-700 transition border border-rose-100 bg-rose-50 px-3 py-1.5 rounded-lg hover:bg-rose-100">Logout</button>
                    </div>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto px-4 mt-8">
                
                {/* HEADER CON GEMINI COACH & RUN RATE */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
                    {/* Box Run Rate (Previsione) */}
                    <div className="lg:col-span-1 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl shadow-lg p-6 text-white relative overflow-hidden">
                        <div className="relative z-10">
                            <p className="text-indigo-200 text-xs font-bold uppercase tracking-wider mb-1">Previsione Spesa {currentDate.toLocaleString('default', { month: 'long' })}</p>
                            <p className="text-3xl font-bold">{formatCurrency(projectedExpense)}</p>
                            <p className="text-xs mt-2 text-indigo-100 opacity-80">Basato su trend variabile di {formatCurrency(dailyAverageVariable)}/giorno.</p>
                        </div>
                        <div className="absolute right-0 bottom-0 h-24 w-24 bg-white opacity-5 rounded-full -mr-10 -mb-10"></div>
                    </div>

                    {/* Box Gemini Coach */}
                    <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex items-start gap-4 relative">
                        <div className="p-3 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-xl flex-shrink-0 text-2xl">✨</div>
                        <div className="flex-1">
                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-1">Il tuo Coach Finanziario</h3>
                            {loadingAdvice ? (
                                <div className="flex items-center gap-2 text-slate-400 text-sm mt-2"><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Analizzo le tue finanze...</div>
                            ) : (
                                <p className="text-slate-600 text-sm italic leading-relaxed">"{aiAdvice || 'Inizia ad aggiungere transazioni per ricevere consigli personalizzati!'}"</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                        <div className="flex items-center gap-3 mb-6"><div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg></div><h3 className="text-xl font-bold text-slate-800">Budget Mensili</h3></div>
                        <form onSubmit={handleAddBudget} className="flex gap-2 mb-8"><input list="category-list-plan" placeholder="Categoria" className="input-field text-sm flex-1" value={newBudgetCat} onChange={e => setNewBudgetCat(e.target.value)} required /><input type="number" placeholder="Max €" className="input-field text-sm w-24" value={newBudgetLimit} onChange={e => setNewBudgetLimit(e.target.value)} required /><button type="submit" className="bg-indigo-600 text-white px-4 rounded-xl font-bold hover:bg-indigo-700">+</button></form>
                        <div className="space-y-6">
                            {budgets.map(b => {
                                const spent = calculateSpent(b.category);
                                const percent = Math.min((spent / b.limit) * 100, 100);
                                const barColor = percent >= 100 ? 'bg-rose-500' : percent > 75 ? 'bg-amber-400' : 'bg-emerald-500';
                                return (
                                    <div key={b.id} className="group">
                                        <div className="flex justify-between text-sm mb-2"><span className="font-bold text-slate-700">{b.category}</span><div className="flex items-center gap-3"><span className="font-mono text-slate-500">{formatCurrency(spent)} / <span className="text-slate-800 font-bold">{formatCurrency(b.limit)}</span></span><button onClick={() => handleDeleteBudget(b.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg></button></div></div>
                                        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden shadow-inner"><div className={`h-3 rounded-full transition-all duration-1000 ${barColor}`} style={{ width: `${percent}%` }}></div></div>
                                        {percent >= 100 && <p className="text-xs text-rose-500 font-bold mt-1 text-right">Budget superato!</p>}
                                    </div>
                                );
                            })}
                            {budgets.length === 0 && <p className="text-slate-400 text-sm text-center italic">Nessun budget impostato.</p>}
                        </div>
                    </div>

                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                        <div className="flex justify-between items-center mb-6"><div className="flex items-center gap-3"><div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div><h3 className="text-xl font-bold text-slate-800">Obiettivi</h3></div><button onClick={() => setShowGoalForm(!showGoalForm)} className="text-xs font-bold bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition">{showGoalForm ? 'Chiudi' : '+ Nuovo Obiettivo'}</button></div>
                        {showGoalForm && (
                            <form onSubmit={handleAddGoal} className="mb-8 bg-slate-50 p-4 rounded-xl border border-slate-200 animate-fadeIn">
                                <div className="grid grid-cols-4 gap-3 mb-3">{GOAL_ICONS.map(icon => (<button type="button" key={icon.id} onClick={() => setNewGoalIcon(icon.icon)} className={`text-2xl py-2 rounded-lg border transition ${newGoalIcon === icon.icon ? 'bg-white border-emerald-500 shadow-sm' : 'border-transparent hover:bg-slate-200'}`}>{icon.icon}</button>))}</div>
                                <div className="space-y-3"><input type="text" placeholder="Nome" className="input-field text-sm" value={newGoalName} onChange={e => setNewGoalName(e.target.value)} required /><div className="grid grid-cols-2 gap-3"><input type="number" placeholder="Target €" className="input-field text-sm" value={newGoalTarget} onChange={e => setNewGoalTarget(e.target.value)} required /><input type="date" className="input-field text-sm" value={newGoalDate} onChange={e => setNewGoalDate(e.target.value)} /></div><button type="submit" className="w-full bg-emerald-600 text-white text-sm font-bold py-2 rounded-lg hover:bg-emerald-700">Crea Obiettivo</button></div>
                            </form>
                        )}
                        <div className="space-y-6">
                            {goals.map(g => {
                                const percent = Math.min((g.current / g.target) * 100, 100);
                                const pace = calculatePace(g);
                                return (
                                    <div key={g.id} className="bg-white border border-slate-100 rounded-2xl p-5 relative group shadow-sm hover:shadow-md transition-all">
                                        <button onClick={() => handleDeleteGoal(g.id)} className="absolute top-3 right-3 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
                                        <div className="flex items-start gap-4 mb-4"><div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-3xl border border-emerald-100">{g.icon || '🎯'}</div><div className="flex-1"><div className="flex justify-between items-start"><h4 className="font-bold text-slate-800 text-lg leading-tight">{g.name}</h4><span className="font-mono text-lg font-bold text-emerald-600">{formatCurrency(g.current)}</span></div><div className="flex justify-between items-end mt-1"><p className="text-xs text-slate-400 font-medium">Target: {formatCurrency(g.target)}</p><p className="text-xs text-slate-400 font-medium">{percent.toFixed(0)}%</p></div></div></div>
                                        <div className="w-full bg-slate-100 rounded-full h-3 mb-3 overflow-hidden"><div className="bg-emerald-500 h-3 rounded-full transition-all duration-1000 relative" style={{ width: `${percent}%` }}><div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,.2)_50%,rgba(255,255,255,.2)_75%,transparent_75%,transparent)] bg-[length:1rem_1rem]"></div></div></div>
                                        {g.deadline && g.current < g.target && (<div className="mb-4 bg-slate-50 p-2 rounded-lg flex items-center gap-2"><svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg><p className="text-xs text-slate-600">Risparmia <span className="font-bold text-indigo-600">{formatCurrency(pace)}/mese</span> per finire entro il {new Date(g.deadline).toLocaleDateString()}.</p></div>)}
                                        <div className="flex gap-2 mt-2"><button onClick={() => handleAddSavings(g, 10)} className="flex-1 py-2 bg-white border border-emerald-200 text-emerald-700 text-xs font-bold rounded-lg hover:bg-emerald-50 transition">+ 10 €</button><button onClick={() => handleAddSavings(g, 50)} className="flex-1 py-2 bg-white border border-emerald-200 text-emerald-700 text-xs font-bold rounded-lg hover:bg-emerald-50 transition">+ 50 €</button><button onClick={() => handleAddSavings(g, 100)} className="flex-1 py-2 bg-white border border-emerald-200 text-emerald-700 text-xs font-bold rounded-lg hover:bg-emerald-50 transition">+ 100 €</button></div>
                                    </div>
                                );
                            })}
                            {goals.length === 0 && <p className="text-slate-400 text-sm text-center italic">Nessun obiettivo attivo.</p>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Planning;