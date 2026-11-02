'use client';
import React, { createContext, useContext, useState } from 'react';

export type MockUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarInitial: string;
};

export const DEMO_USERS: MockUser[] = [
  {
    id: 'user-alex',
    name: 'Alex Chen',
    email: 'alex@startzy.ai',
    role: 'Lead Founder',
    avatarInitial: 'A',
  },
  {
    id: 'user-veejay',
    name: 'Veejay',
    email: 'veejay@startzy.ai',
    role: 'Venture Founder · MedPulse',
    avatarInitial: 'V',
  },
  {
    id: 'user-meera',
    name: 'Meera',
    email: 'meera@startzy.ai',
    role: 'Bootstrapped Founder · Kitsune',
    avatarInitial: 'M',
  },
  {
    id: 'user-rahul',
    name: 'Rahul',
    email: 'rahul@startzy.ai',
    role: 'Enterprise Founder · ShieldGate',
    avatarInitial: 'R',
  },
];

type MockAuthContextType = {
  user: MockUser | null;
  login: (email: string, name?: string) => void;
  loginAsDemo: (userId: string) => void;
  signup: (name: string, email: string) => void;
  logout: () => void;
  isMock: true;
};

const MockAuthContext = createContext<MockAuthContextType | undefined>(undefined);

const STORAGE_KEY = 'startzy_mock_user';

export function MockAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MockUser | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const login = (email: string, name?: string) => {
    const matched = DEMO_USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
    const newUser: MockUser = matched || {
      id: `user-${Date.now()}`,
      name: name || email.split('@')[0],
      email,
      role: 'Founder',
      avatarInitial: (name || email)[0].toUpperCase(),
    };
    setUser(newUser);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
    } catch {
      // ignore
    }
  };

  const loginAsDemo = (userId: string) => {
    const found = DEMO_USERS.find(u => u.id === userId) || DEMO_USERS[0];
    setUser(found);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(found));
    } catch {
      // ignore
    }
  };

  const signup = (name: string, email: string) => {
    login(email, name);
  };

  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  return (
    <MockAuthContext.Provider value={{ user, login, loginAsDemo, signup, logout, isMock: true }}>
      {children}
    </MockAuthContext.Provider>
  );
}

export function useMockAuth() {
  const ctx = useContext(MockAuthContext);
  if (!ctx) throw new Error('useMockAuth must be used within MockAuthProvider');
  return ctx;
}
