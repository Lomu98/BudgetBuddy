import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, writeBatch, doc, increment } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { rrulestr } from 'rrule';
import { format, startOfMonth, endOfMonth } from 'date-fns';

const generateVirtualOccurrences = (tpl, startDt, endDt, exceptions) => {
    if (!tpl.recurrenceRule || tpl.isVirtual) return [];
    try {
        const [y, m, d] = tpl.date.split('-').map(Number);
        const startRuleDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)); // UTC noon to avoid timezone shifts
        let ruleString = `DTSTART:${format(startRuleDate, "yyyyMMdd'T'HHmmss'Z'")}\n${tpl.recurrenceRule}`;
        
        if (tpl.recurrenceEndDate) {
            const [ey, em, ed] = tpl.recurrenceEndDate.split('-').map(Number);
            const endDate = new Date(Date.UTC(ey, em - 1, ed, 23, 59, 59));
            ruleString += `\nUNTIL=${format(endDate, "yyyyMMdd'T'HHmmss'Z'")}`;
        }

        const rule = rrulestr(ruleString, { forceset: true });
        const utcStart = new Date(Date.UTC(startDt.getFullYear(), startDt.getMonth(), startDt.getDate()));
        const utcEnd = new Date(Date.UTC(endDt.getFullYear(), endDt.getMonth(), endDt.getDate(), 23, 59, 59));
        
        return rule.between(utcStart, utcEnd, true).map((occDate) => {
            const occDateISO = format(occDate, 'yyyy-MM-dd');
            if (occDateISO === tpl.date || exceptions.has(occDateISO)) return null;
            return {
                ...tpl, id: `vrt_${tpl.id}_${occDateISO.replace(/-/g, '')}`, date: occDateISO, isVirtual: true, originalId: tpl.id, 
            };
        }).filter(t => t !== null);

    } catch (e) {
        console.warn(`Skipping invalid recurrence rule for ID ${tpl.id}:`, e);
        return [];
    }
};

export const useRecurringTransactions = (userId, currentDate) => {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    const startDt = useMemo(() => startOfMonth(currentDate), [currentDate]);
    const endDt = useMemo(() => endOfMonth(currentDate), [currentDate]);
    const startDateISO = format(startDt, 'yyyy-MM-dd');
    const endDateISO = format(endDt, 'yyyy-MM-dd');

    const fetchAllData = async () => {
        if (!userId) { setLoading(false); return; }
        setLoading(true);
        try {
            const q = query(collection(db, 'transactions'), where('userId', '==', userId));
            const snapshot = await getDocs(q);
            const fetchedData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Materializza le transazioni pianificate con data scaduta
            const today = format(new Date(), 'yyyy-MM-dd');
            const toMaterialize = fetchedData.filter(t => t.status === 'scheduled' && t.date <= today);
            if (toMaterialize.length > 0) {
                const accountDeltas = {};
                toMaterialize.forEach(t => {
                    const delta = (t.type === 'expense' || t.type === 'transfer') ? -t.amount : t.amount;
                    accountDeltas[t.accountId] = (accountDeltas[t.accountId] || 0) + delta;
                    if (t.type === 'transfer' && t.toAccountId) {
                        accountDeltas[t.toAccountId] = (accountDeltas[t.toAccountId] || 0) + t.amount;
                    }
                });
                const batch = writeBatch(db);
                toMaterialize.forEach(t => {
                    batch.update(doc(db, 'transactions', t.id), { status: 'completed' });
                });
                Object.entries(accountDeltas).forEach(([accId, delta]) => {
                    batch.update(doc(db, 'accounts', accId), { balance: increment(delta), cash: increment(delta) });
                });
                await batch.commit();
                toMaterialize.forEach(t => { t.status = 'completed'; });
            }

            const excQ = query(collection(db, 'exceptions'), where('userId', '==', userId));
            const excSnapshot = await getDocs(excQ);
            let exceptionsMap = {}; // Map originalId -> Set of dates
            excSnapshot.docs.forEach(d => {
                const data = d.data();
                if (!exceptionsMap[data.originalTransactionId]) exceptionsMap[data.originalTransactionId] = new Set();
                exceptionsMap[data.originalTransactionId].add(data.exceptionDate);
            });

            let finalResults = [];
            fetchedData.forEach(t => {
                const tDate = t.date;
                const excs = exceptionsMap[t.id] || new Set();
                
                if (t.isRecurring) {
                    if (tDate >= startDateISO && tDate <= endDateISO && !excs.has(tDate)) finalResults.push(t);
                    finalResults.push(...generateVirtualOccurrences(t, startDt, endDt, excs));
                } else if (tDate >= startDateISO && tDate <= endDateISO) {
                    finalResults.push(t);
                }
            });

            finalResults.sort((a, b) => new Date(b.date) - new Date(a.date));
            setTransactions(finalResults);
        } catch (error) { console.error("Error fetching data:", error); } 
        finally { setLoading(false); }
    };

    useEffect(() => { fetchAllData(); }, [userId, startDateISO]);
    return { transactions, loading, refetch: fetchAllData };
};