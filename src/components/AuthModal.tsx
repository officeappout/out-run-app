"use client";

import React, { useState } from 'react';
import { signUp, signIn, signInWithGoogle, linkGoogleAccount } from '@/lib/auth.service';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      let result;
      const isAnonymous = auth.currentUser?.isAnonymous;

      if (isAnonymous) {
        // Upgrade Guest -> Google
        result = await linkGoogleAccount();
      } else {
        // Standard Sign In
        result = await signInWithGoogle();
      }

      const { user, error: googleError } = result;
      if (googleError) {
        setError(googleError);
        setLoading(false);
        return;
      }

      if (user) {
        // Sync to Firestore
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userSnapshot = await getDoc(userDocRef);

          if (!userSnapshot.exists()) {
            // New user: Create basic profile
            await setDoc(userDocRef, {
              id: user.uid,
              core: {
                name: user.displayName || 'User',
                initialFitnessTier: 1, // Default
                trackingMode: 'wellness', // Default
                mainGoal: 'healthy_lifestyle', // Default
                gender: 'other', // Default
                weight: 70, // Default
                photoURL: user.photoURL,
                email: user.email,
              },
              progression: {
                globalLevel: 1,
                globalXP: 0,
                coins: 0,
                totalCaloriesBurned: 0,
                hasUnlockedAdvancedStats: false,
              },
              updatedAt: serverTimestamp(),
              createdAt: serverTimestamp(),
            });
          } else {
            // Existing user: Update photo/name if changed (optional, but requested)
            // We'll merge just the core fields we care about
            await setDoc(userDocRef, {
              core: {
                ...userSnapshot.data().core,
                name: user.displayName || userSnapshot.data().core.name,
                photoURL: user.photoURL || userSnapshot.data().core.photoURL,
              },
              updatedAt: serverTimestamp(),
            }, { merge: true });
          }
        } catch (fsError) {
          console.error("Firestore Sync Error:", fsError);
          // Don't block login on sync error
        }

        onSuccess();
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'שגיאה בהתחברות עם גוגל');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        const { user, error: signUpError } = await signUp(email, password, displayName);
        if (signUpError) {
          setError(signUpError);
          setLoading(false);
          return;
        }
        if (user) {
          onSuccess();
          onClose();
        }
      } else {
        const { user, error: signInError } = await signIn(email, password);
        if (signInError) {
          setError(signInError);
          setLoading(false);
          return;
        }
        if (user) {
          onSuccess();
          onClose();
        }
      }
    } catch (err: any) {
      setError(err.message || 'שגיאה בהתחברות');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {isSignUp ? 'הרשמה' : 'התחברות'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <span className="material-icons-round text-gray-600">close</span>
          </button>
        </div>

        {/* Google Sign In Button */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full bg-white border border-gray-300 text-gray-700 py-3 rounded-xl font-bold text-lg hover:bg-gray-50 active:scale-95 transition-all flex items-center justify-center gap-3 mb-6"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="w-6 h-6" />
          התחבר עם Google
        </button>

        <div className="flex items-center gap-4 mb-6">
          <div className="h-px bg-gray-200 flex-1" />
          <span className="text-gray-400 text-sm">או</span>
          <div className="h-px bg-gray-200 flex-1" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                שם מלא
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#00C9F2] focus:border-transparent"
                placeholder="הכנס שם"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              אימייל
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#00C9F2] focus:border-transparent"
              placeholder="example@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              סיסמה
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#00C9F2] focus:border-transparent"
              placeholder="מינימום 6 תווים"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#00C9F2] text-white py-3 rounded-xl font-bold text-lg hover:bg-[#00B4D8] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'מתחבר...' : isSignUp ? 'הרשמה' : 'התחברות'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
            className="text-[#00C9F2] text-sm font-medium hover:underline"
          >
            {isSignUp ? 'יש לך חשבון? התחבר' : 'אין לך חשבון? הרשם'}
          </button>
        </div>
      </div>
    </div>
  );
}
