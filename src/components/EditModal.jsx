import React, { useState, useEffect } from 'react';

// Aggiungi 'accounts' alle props
function EditModal({ t, mode, onClose, onSubmit, suggestedCategories = [], accounts = [] }) {
    const [description, setDescription] = useState(t.description || '');
    const [amount, setAmount] = useState(t.amount || '');
    const [date, setDate] = useState(t.date || '');
    const [type, setType] = useState(t.type || 'expense');
    const [category, setCategory] = useState(t.category || '');
    
    // Gestione Conto (sostituisce paymentMethod testuale)
    const [accountId, setAccountId] = useState(t.accountId || '');

    // Stati Ricorrenza... (Invariati)
    const [isRecurring, setIsRecurring] = useState(t.isRecurring || false);
    const [recurrenceInterval, setRecurrenceInterval] = useState(1);
    const [recurrenceUnit, setRecurrenceUnit] = useState('MONTHLY');
    const [recurrenceAction, setRecurrenceAction] = useState(
        t.isVirtual ? 'occurrence' : (t.isRecurring ? 'series' : 'active')
    );

    useEffect(() => {
        if ((mode === 'modify-series' || mode === 'edit' || mode === 'modify-occurrence') && t.recurrenceRule) {
            const rule = t.recurrenceRule;
            const intervalMatch = rule.match(/INTERVAL=(\d+)/);
            const freqMatch = rule.match(/FREQ=([A-Z]+)/);
            if (intervalMatch) setRecurrenceInterval(intervalMatch[1]);
            if (freqMatch) setRecurrenceUnit(freqMatch[1]);
            setIsRecurring(true);
        }
    }, [mode, t.recurrenceRule]);

    const handleSubmit = (e) => {
        e.preventDefault();
        
        // Trova il nome del conto per retro-compatibilità o visualizzazione
        const selectedAcc = accounts.find(a => a.id === accountId);
        const paymentMethodName = selectedAcc ? selectedAcc.name : 'Sconosciuto';

        const baseData = { 
            description, 
            amount, 
            date, 
            type, 
            category, 
            accountId, // ID del conto
            paymentMethod: paymentMethodName // Nome del conto
        };
        
        let finalMode = mode;
        let extraData = {};

        if (!t.isRecurring && !t.isVirtual && isRecurring) {
            extraData = { makeRecurring: true, recurrenceRule: `FREQ=${recurrenceUnit};INTERVAL=${recurrenceInterval}`, isRecurring: true };
        }
        
        if (t.isRecurring || t.isVirtual) {
            if (recurrenceAction === 'occurrence') finalMode = 'modify-occurrence';
            else if (recurrenceAction === 'series') {
                finalMode = 'modify-series';
                extraData = { recurrenceRule: `FREQ=${recurrenceUnit};INTERVAL=${recurrenceInterval}` };
            }
            else if (recurrenceAction === 'terminate') finalMode = 'terminate-series';
            else if (recurrenceAction === 'convert') finalMode = 'convert-to-single';
        }
        onSubmit(finalMode, t, { ...baseData, ...extraData });
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            
            <datalist id="modal-category-list">
                {suggestedCategories.map((cat, i) => <option key={i} value={cat} />)}
            </datalist>

            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-slate-800">{t.isRecurring || t.isVirtual ? 'Gestione Serie' : 'Modifica Transazione'}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-rose-500 text-2xl leading-none">&times;</button>
                </div>
                <div className="overflow-y-auto p-6">
                    <form id="edit-form" onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-4">
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Descrizione</label><input type="text" className="input-field" required value={description} onChange={e => setDescription(e.target.value)} /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Importo</label><input type="number" step="0.01" className="input-field font-mono" required value={amount} onChange={e => setAmount(e.target.value)} /></div>
                                <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Data</label><input type="date" className="input-field" required value={date} onChange={e => setDate(e.target.value)} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Categoria</label><input type="text" className="input-field" required value={category} onChange={e => setCategory(e.target.value)} list="modal-category-list" /></div>
                                <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tipo</label><select className="select-field" value={type} onChange={e => setType(e.target.value)}><option value="expense">Uscita</option><option value="income">Entrata</option></select></div>
                            </div>
                            
                            {/* SELETTORE CONTO (Aggiornato) */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Conto</label>
                                <select 
                                    className="input-field appearance-none cursor-pointer" 
                                    required 
                                    value={accountId} 
                                    onChange={e => setAccountId(e.target.value)}
                                >
                                    <option value="" disabled>Seleziona un conto</option>
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.name} (Saldo: {acc.balance}€)</option>
                                    ))}
                                </select>
                                {accounts.length === 0 && <p className="text-xs text-rose-500 mt-1">Nessun conto disponibile.</p>}
                            </div>
                        </div>

                        <hr className="border-slate-100 my-4" />

                        {/* ... (Sezioni Ricorrenza invariate rispetto alla versione precedente) ... */}
                        {!t.isRecurring && !t.isVirtual && (
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <label className="flex items-center space-x-3 cursor-pointer mb-3"><input type="checkbox" className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} /><span className="font-bold text-slate-700">Rendi Ricorrente</span></label>
                                {isRecurring && (
                                    <div className="flex gap-2 items-center mt-2">
                                        <span className="text-sm text-slate-600">Ogni</span>
                                        <input type="number" min="1" className="w-16 p-2 rounded-lg border border-slate-200 text-center text-sm" value={recurrenceInterval} onChange={e => setRecurrenceInterval(e.target.value)} />
                                        <select className="p-2 rounded-lg border border-slate-200 text-sm flex-grow" value={recurrenceUnit} onChange={e => setRecurrenceUnit(e.target.value)}><option value="DAILY">Giorno/i</option><option value="WEEKLY">Settimana/e</option><option value="MONTHLY">Mese/i</option><option value="YEARLY">Anno/i</option></select>
                                    </div>
                                )}
                            </div>
                        )}

                        {(t.isRecurring || t.isVirtual) && (
                            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 space-y-3">
                                <h4 className="text-indigo-800 font-bold text-sm">Opzioni Serie</h4>
                                <label className="flex items-start space-x-3 cursor-pointer"><input type="radio" name="recAction" className="mt-1 text-indigo-600 focus:ring-indigo-500" checked={recurrenceAction === 'occurrence'} onChange={() => setRecurrenceAction('occurrence')} /><div className="text-sm"><span className="font-semibold text-slate-800 block">Modifica solo questa occorrenza</span><span className="text-slate-500 text-xs">Le altre transazioni della serie non verranno modificate.</span></div></label>
                                <label className="flex items-start space-x-3 cursor-pointer"><input type="radio" name="recAction" className="mt-1 text-indigo-600 focus:ring-indigo-500" checked={recurrenceAction === 'series'} onChange={() => setRecurrenceAction('series')} /><div className="text-sm"><span className="font-semibold text-slate-800 block">Modifica intera serie</span><span className="text-slate-500 text-xs">Modifica questa e tutte le occorrenze future.</span></div></label>
                                {recurrenceAction === 'series' && (<div className="flex gap-2 items-center ml-7 mb-2 animate-fadeIn"><input type="number" min="1" className="w-14 p-1 rounded border border-indigo-200 text-center text-xs" value={recurrenceInterval} onChange={e => setRecurrenceInterval(e.target.value)} /><select className="p-1 rounded border border-indigo-200 text-xs" value={recurrenceUnit} onChange={e => setRecurrenceUnit(e.target.value)}><option value="DAILY">Giorni</option><option value="WEEKLY">Settimane</option><option value="MONTHLY">Mesi</option><option value="YEARLY">Anni</option></select></div>)}
                                <hr className="border-indigo-200/50" />
                                <label className="flex items-start space-x-3 cursor-pointer"><input type="radio" name="recAction" className="mt-1 text-rose-500 focus:ring-rose-500" checked={recurrenceAction === 'terminate'} onChange={() => setRecurrenceAction('terminate')} /><div className="text-sm"><span className="font-semibold text-slate-800 block">Termina serie qui</span><span className="text-slate-500 text-xs">Nessuna transazione futura verrà creata.</span></div></label>
                                <label className="flex items-start space-x-3 cursor-pointer"><input type="radio" name="recAction" className="mt-1 text-rose-500 focus:ring-rose-500" checked={recurrenceAction === 'convert'} onChange={() => setRecurrenceAction('convert')} /><div className="text-sm"><span className="font-semibold text-slate-800 block">Converti in singola</span><span className="text-slate-500 text-xs">Cancella la serie e mantieni solo questa voce.</span></div></label>
                            </div>
                        )}
                    </form>
                </div>
                <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 shrink-0"><button type="submit" form="edit-form" className="btn-primary">Salva Modifiche</button></div>
            </div>
        </div>
    );
}

export default EditModal;