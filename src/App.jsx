import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from './firebaseConfig'; 

import Login from './components/Login';         
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import AnnualSummary from './components/AnnualSummary'; 
import UserProfile from './components/UserProfile';
import Planning from './components/Planning';
import Investments from './components/Investments';
import AccountDetail from './components/AccountDetail';

const ProtectedRoute = ({ children }) => {
  const [user, loading] = useAuthState(auth);
  if (loading) return <div className="flex items-center justify-center min-h-screen bg-slate-50 text-indigo-600 font-medium">Caricamento...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return children;
};

function App() {
  return (
    <Router>
      <div className="font-sans bg-slate-50 min-h-screen">
        <Routes>
          <Route path="/auth" element={<Login />} /> 
          <Route path="/register" element={<Register />} />

          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/summary" element={<ProtectedRoute><AnnualSummary /></ProtectedRoute>} />
          <Route path="/planning" element={<ProtectedRoute><Planning /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
          <Route path="/investments" element={<ProtectedRoute><Investments /></ProtectedRoute>} />
          <Route path="/account/:id" element={<ProtectedRoute><AccountDetail /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;