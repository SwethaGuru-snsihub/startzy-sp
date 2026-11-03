'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { DEMO_USERS, useMockAuth } from '@/context/MockAuthContext';
import { getSpStore } from '@/features/sp/spStore';

/* /sp: sign in (mock), then open the user's latest Solution Planning project, or start a new one. */
export default function SpEntry() {
  const router = useRouter();
  const { user, login, loginAsDemo } = useMockAuth();

  useEffect(() => {
    if (!user) return;
    const store = getSpStore(user.id);
    router.replace(`/sp/${(store.latest() ?? store.create()).id}`);
  }, [user, router]);

  if (user) return <div className="sp-login t-small">Opening your office…</div>;
  return (
    <div className="sp-login">
      <form className="sp-lcard" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); login(String(f.get('email') || 'founder@startzy.ai')); }}>
        <div><span className="sp-sim">PROTOTYPE · MOCK SIGN-IN</span></div>
        <div><h1>Solution Planning</h1><p className="t-small" style={{ margin: '4px 0 0' }}>Your AI planning office. Sign in to bring an idea to the agents.</p></div>
        <div className="t-caps">Quick sign in (demo accounts)</div>
        <div className="sp-demo">
          {DEMO_USERS.map(u => (
            <button key={u.id} type="button" onClick={() => loginAsDemo(u.id)}>
              <span className="face">{u.avatarInitial}</span><span><b className="t-strong" style={{ fontSize: 13 }}>{u.name}</b><small>{u.role.split(' · ')[0]}</small></span>
            </button>
          ))}
        </div>
        <div className="t-caps">Or enter email</div>
        <div className="sp-field"><input name="email" type="email" aria-label="Email" placeholder="you@company.com" defaultValue="alex@startzy.ai" /></div>
        <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center' }}>Sign in to Solution Planning</button>
        <p className="t-small" style={{ fontSize: 12, margin: 0 }}>No real password is checked. Your work is saved in this browser only.</p>
      </form>
    </div>
  );
}
