import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { rrulestr } from 'rrule';
import { format } from 'date-fns';

// Helper generazione ricorrenze annuali
const generateAnnualVirtualOccurrences = (tpl, startYearDt, endYearDt, exceptions) => {
    if (!tpl.recurrenceRule || tpl.isVirtual) return [];
    try {
        const [y, m, d] = tpl.date.split('-').map(Number);
        const startRuleDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        let ruleString = `DTSTART:${format(startRuleDate, "yyyyMMdd'T'HHmmss'Z'")}\n${tpl.recurrenceRule}`;
        if (tpl.recurrenceEndDate) {
            const [ey, em, ed] = tpl.recurrenceEndDate.split('-').map(Number);
            const endDate = new Date(Date.UTC(ey, em - 1, ed, 23, 59, 59));
            ruleString += `\nUNTIL=${format(endDate, "yyyyMMdd'T'HHmmss'Z'")}`;
        }
        const rule = rrulestr(ruleString, { forceset: true });
        const utcStart = new Date(Date.UTC(startYearDt.getFullYear(), 0, 1));
        const utcEnd = new Date(Date.UTC(endYearDt.getFullYear(), 11, 31, 23, 59, 59));
        
        return rule.between(utcStart, utcEnd, true).map((occDate) => {
            const occDateISO = format(occDate, 'yyyy-MM-dd');
            if (occDateISO === tpl.date || exceptions.has(`${tpl.id}_${occDateISO}`)) return null;
            return { ...tpl, id: `vrt_${tpl.id}_${occDateISO.replace(/-/g, '')}`, date: occDateISO, isVirtual: true, originalId: tpl.id };
        }).filter(t => t !== null);
    } catch (e) { return []; }
};

export const useAnnualSummary = (userId, currentYear) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userId) { setLoading(false); return; }

        const calculateAnnualData = async () => {
            setLoading(true);
            try {
                const yearStart = new Date(currentYear, 0, 1);
                const yearEnd = new Date(currentYear, 11, 31);
                const yearStartISO = format(yearStart, 'yyyy-MM-dd');
                const yearEndISO = format(yearEnd, 'yyyy-MM-dd');

                const prevYearStart = new Date(currentYear - 1, 0, 1);
                const prevYearEnd = new Date(currentYear - 1, 11, 31);
                const prevYearStartISO = format(prevYearStart, 'yyyy-MM-dd');
                const prevYearEndISO = format(prevYearEnd, 'yyyy-MM-dd');

                const q = query(collection(db, 'transactions'), where('userId', '==', userId));
                const snapshot = await getDocs(q);
                const fetchedTemplates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                const excQ = query(collection(db, 'exceptions'), where('userId', '==', userId));
                const excSnapshot = await getDocs(excQ);
                const exceptionsSet = new Set();
                excSnapshot.docs.forEach(d => { const data = d.data(); if (data.originalTransactionId) exceptionsSet.add(`${data.originalTransactionId}_${data.exceptionDate}`); });

                let currentYearTransactions = [];
                let prevYearTransactions = [];

                fetchedTemplates.forEach(t => {
                    if (t.isRecurring) {
                        if (t.date >= yearStartISO && t.date <= yearEndISO && !exceptionsSet.has(`${t.id}_${t.date}`)) currentYearTransactions.push(t);
                        currentYearTransactions.push(...generateAnnualVirtualOccurrences(t, yearStart, yearEnd, exceptionsSet));
                        
                        if (t.date >= prevYearStartISO && t.date <= prevYearEndISO && !exceptionsSet.has(`${t.id}_${t.date}`)) prevYearTransactions.push(t);
                        prevYearTransactions.push(...generateAnnualVirtualOccurrences(t, prevYearStart, prevYearEnd, exceptionsSet));
                    } else {
                        if (t.date >= yearStartISO && t.date <= yearEndISO) currentYearTransactions.push(t);
                        if (t.date >= prevYearStartISO && t.date <= prevYearEndISO) prevYearTransactions.push(t);
                    }
                });

                currentYearTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

                // --- CALCOLO TOTALI CORRENTI (ESCLUDENDO TRANSFER) ---
                let totalIncome = 0, totalExpense = 0;
                let monthlyIncome = new Array(12).fill(0);
                let monthlyExpense = new Array(12).fill(0);
                let incomeByCategory = {}, expenseByCategory = {};

                for (const t of currentYearTransactions) {
                    // IGNORA I TRASFERIMENTI NEI TOTALI
                    if (t.type === 'transfer') continue;

                    const monthIndex = new Date(t.date).getMonth();
                    
                    if (t.type === 'income') {
                        totalIncome += t.amount; 
                        monthlyIncome[monthIndex] += t.amount;
                        incomeByCategory[t.category] = (incomeByCategory[t.category] || 0) + t.amount;
                    } else if (t.type === 'expense') {
                        totalExpense += t.amount; 
                        monthlyExpense[monthIndex] += t.amount;
                        expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + t.amount;
                    }
                }

                // --- CALCOLO TOTALI ANNO PRECEDENTE (ESCLUDENDO TRANSFER) ---
                let prevTotalIncome = 0, prevTotalExpense = 0;
                for (const t of prevYearTransactions) {
                    if (t.type === 'transfer') continue; // Ignora transfer anche qui
                    if (t.type === 'income') prevTotalIncome += t.amount;
                    else if (t.type === 'expense') prevTotalExpense += t.amount;
                }

                setData({
                    totalIncome, totalExpense, monthlyIncome, monthlyExpense, 
                    incomeByCategory, expenseByCategory, 
                    allTransactions: currentYearTransactions,
                    prevTotalIncome, prevTotalExpense
                });

            } catch (error) { console.error("Errore annuale:", error); setData(null); } 
            finally { setLoading(false); }
        };
        calculateAnnualData();
    }, [userId, currentYear]);

    return { data, loading };
};