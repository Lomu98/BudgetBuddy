import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// Helper formattazione valuta
const formatCurrency = (amount) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);

function BudgetGoalsPanel({ user, currentTransactions, suggestedCategories }) {
    const [activeTab, setActiveTab] = useState('budgets'); // 'budgets' | 'goals'
    
    // --- STATI BUDGET ---
    const [budgets, setBudgets] = useState([]);
    const [newBudgetCat, setNewBudgetCat] = useState('');
    const [newBudgetLimit, setNewBudgetLimit] = useState('');
    const [showBudgetForm, setShowBudgetForm] = useState(false);

    // --- STATI GOALS ---
    const [goals, setGoals] = useState([]);
    const [newGoalName, setNewGoalName] = useState('');
    const [newGoalTarget, setNewGoalTarget] = useState('');
    const [showGoalForm, setShowGoalForm] = useState(false);

    // 1. Caricamento Dati in tempo reale (Listeners)
    useEffect(() => {
        if (!user) return;

        // Listener Budgets
        const qBudgets = query(collection(db, 'budgets'), where('userId', '==', user.uid));
        const unsubBudgets = onSnapshot(qBudgets, (snap) => {
            setBudgets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // Listener Goals
        const qGoals = query(collection(db, 'goals'), where('userId', '==', user.uid));
        const unsubGoals = onSnapshot(qGoals, (snap) => {
            setGoals(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => { unsubBudgets(); unsubGoals(); };
    }, [user]);

    // --- LOGICA BUDGET ---
    const handleAddBudget = async (e) => {
        e.preventDefault();
        if (!newBudgetCat || !newBudgetLimit) return;
        await addDoc(collection(db, 'budgets'), {
            userId: user.uid,
            category: newBudgetCat,
            limit: parseFloat(newBudgetLimit)
        });
        setNewBudgetCat(''); setNewBudgetLimit(''); setShowBudgetForm(false);
    };

    const handleDeleteBudget = async (id) => {
        if (window.confirm("Eliminare questo budget?")) await deleteDoc(doc(db, 'budgets', id));
    };

    // Calcolo spese correnti per categoria (basato sulle transazioni filtrate del mese della dashboard)
    const calculateSpent = (category) => {
        return currentTransactions
            .filter(t => t.type === 'expense' && t.category.toLowerCase() === category.toLowerCase())
            .reduce((sum, t) => sum + t.amount, 0);
    };

    // --- LOGICA GOALS ---
    const handleAddGoal = async (e) => {
        e.preventDefault();
        if (!newGoalName || !newGoalTarget) return;
        await addDoc(collection(db, 'goals'), {
            userId: user.uid,
            name: newGoalName,
            target: parseFloat(newGoalTarget),
            current: 0
        });
        setNewGoalName(''); setNewGoalTarget(''); setShowGoalForm(false);
    };

    const handleAddSavings = async (goal, amount) => {
        const newCurrent = goal.current + amount;
        if (newCurrent < 0) return; // Evita negativi
        await updateDoc(doc(db, 'goals', goal.id), { current: newCurrent });
    };

    const handleDeleteGoal = async (id) => {
        if (window.confirm("Eliminare questo obiettivo?")) await deleteDoc(doc(db, 'goals', id));
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 h-full flex flex-col overflow-hidden">
            
            {/* TABS HEADER */}
            <div className="flex border-b border-slate-100">
                <button 
                    onClick={() => setActiveTab('budgets')}
                    className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${activeTab === 'budgets' ? 'bg-indigo-50 text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    Budget Mensili
                </button>
                <button 
                    onClick={() => setActiveTab('goals')}
                    className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${activeTab === 'goals' ? 'bg-emerald-50 text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    Obiettivi
                </button>
            </div>

            {/* CONTENUTO */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                
                {/* --- SEZIONE BUDGETS --- */}
                {activeTab === 'budgets' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-800">Limiti di Spesa</h3>
                            <button onClick={() => setShowBudgetForm(!showBudgetForm)} className="text-xs font-bold bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition">
                                {showBudgetForm ? 'Chiudi' : '+ Nuovo'}
                            </button>
                        </div>

                        {showBudgetForm && (
                            <form onSubmit={handleAddBudget} className="bg-slate-50 p-4 rounded-xl border border-slate-200 animate-fadeIn">
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <input list="category-list" placeholder="Categoria" className="input-field text-xs" value={newBudgetCat} onChange={e => setNewBudgetCat(e.target.value)} required />
                                    <input type="number" placeholder="Limite €" className="input-field text-xs" value={newBudgetLimit} onChange={e => setNewBudgetLimit(e.target.value)} required />
                                </div>
                                <button type="submit" className="w-full bg-indigo-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-indigo-700">Salva Budget</button>
                            </form>
                        )}

                        {budgets.length === 0 && !showBudgetForm && <p className="text-center text-slate-400 text-sm py-4">Nessun budget impostato.</p>}

                        <div className="space-y-5">
                            {budgets.map(b => {
                                const spent = calculateSpent(b.category);
                                const percent = Math.min((spent / b.limit) * 100, 100);
                                // Colore dinamico: Verde < 75%, Giallo < 100%, Rosso >= 100%
                                const barColor = percent >= 100 ? 'bg-rose-500' : percent > 75 ? 'bg-amber-400' : 'bg-emerald-500';
                                const textColor = percent >= 100 ? 'text-rose-600' : 'text-slate-600';

                                return (
                                    <div key={b.id} className="group">
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="font-bold text-slate-700">{b.category}</span>
                                            <div className="flex items-center gap-2">
                                                <span className={`font-mono font-medium ${textColor}`}>{formatCurrency(spent)} / {formatCurrency(b.limit)}</span>
                                                <button onClick={() => handleDeleteBudget(b.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                                </button>
                                            </div>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                            <div className={`h-2.5 rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${percent}%` }}></div>
                                        </div>
                                        {percent >= 100 && <p className="text-[10px] text-rose-500 font-bold mt-1 text-right">Budget superato!</p>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* --- SEZIONE GOALS --- */}
                {activeTab === 'goals' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-800">I miei Obiettivi</h3>
                            <button onClick={() => setShowGoalForm(!showGoalForm)} className="text-xs font-bold bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition">
                                {showGoalForm ? 'Chiudi' : '+ Nuovo'}
                            </button>
                        </div>

                        {showGoalForm && (
                            <form onSubmit={handleAddGoal} className="bg-slate-50 p-4 rounded-xl border border-slate-200 animate-fadeIn">
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <input type="text" placeholder="Nome (es. Vacanze)" className="input-field text-xs" value={newGoalName} onChange={e => setNewGoalName(e.target.value)} required />
                                    <input type="number" placeholder="Obiettivo €" className="input-field text-xs" value={newGoalTarget} onChange={e => setNewGoalTarget(e.target.value)} required />
                                </div>
                                <button type="submit" className="w-full bg-emerald-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-emerald-700">Crea Obiettivo</button>
                            </form>
                        )}

                        {goals.length === 0 && !showGoalForm && <p className="text-center text-slate-400 text-sm py-4">Nessun obiettivo attivo.</p>}

                        <div className="grid grid-cols-1 gap-4">
                            {goals.map(g => {
                                const percent = Math.min((g.current / g.target) * 100, 100);
                                return (
                                    <div key={g.id} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm hover:shadow-md transition relative group">
                                        <button onClick={() => handleDeleteGoal(g.id)} className="absolute top-2 right-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                        </button>
                                        
                                        <div className="flex justify-between items-end mb-2">
                                            <div>
                                                <h4 className="font-bold text-slate-700">{g.name}</h4>
                                                <p className="text-xs text-slate-400">Target: {formatCurrency(g.target)}</p>
                                            </div>
                                            <span className="font-mono text-lg font-bold text-emerald-600">{formatCurrency(g.current)}</span>
                                        </div>
                                        
                                        <div className="w-full bg-slate-100 rounded-full h-2 mb-4">
                                            <div className="bg-emerald-500 h-2 rounded-full transition-all duration-500" style={{ width: `${percent}%` }}></div>
                                        </div>

                                        <div className="flex gap-2">
                                            <button onClick={() => handleAddSavings(g, 10)} className="flex-1 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded hover:bg-emerald-100 transition">+ 10 €</button>
                                            <button onClick={() => handleAddSavings(g, 50)} className="flex-1 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded hover:bg-emerald-100 transition">+ 50 €</button>
                                            <button onClick={() => handleAddSavings(g, 100)} className="flex-1 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded hover:bg-emerald-100 transition">+ 100 €</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default BudgetGoalsPanel;