'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/AuthContext';

type Tab = 'login' | 'register';

export default function LoginPage() {
  const router = useRouter();
  const { login, register } = useAuth();
  const [tab, setTab] = useState<Tab>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Login state
  const [email, setEmail] = useState('dr.kim@brightsmile.com');
  const [password, setPassword] = useState('Demo@12345');

  // Register state
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regName, setRegName] = useState('');
  const [regPractice, setRegPractice] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally { setLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (regPassword !== regConfirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      await register(regEmail, regPassword, regName, regPractice);
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally { setLoading(false); }
  };

  return (
    <div style={{minHeight:'100vh',display:'grid'}}>
      <style>{`
        @media(min-width:900px){.lw{grid-template-columns:1fr 1fr!important}}
        .login-left{background:var(--navy);display:flex;flex-direction:column;justify-content:center;align-items:center;padding:48px 40px;position:relative;overflow:hidden;min-height:260px}
        .login-left::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 30% 20%,rgba(74,191,176,0.25) 0%,transparent 60%),radial-gradient(ellipse at 80% 80%,rgba(74,191,176,0.12) 0%,transparent 50%)}
        .login-feature{display:flex;align-items:center;gap:12px;margin-bottom:14px;text-align:left}
        .lf-icon{width:36px;height:36px;border-radius:10px;background:rgba(74,191,176,0.18);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:17px}
        .auth-tab{flex:1;padding:10px;font-size:13px;font-weight:600;border:none;cursor:pointer;background:transparent;transition:all .15s;border-bottom:2px solid transparent;color:var(--ink3)}
        .auth-tab.active{color:var(--teal-dark);border-color:var(--teal);background:var(--teal-xpale)}
        .input-wrap{position:relative}
        .input-wrap input{padding-right:40px}
        .eye-btn{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--ink3);font-size:11px;font-weight:600;line-height:1;text-transform:uppercase;letter-spacing:0.04em}
        .pw-strength{display:flex;gap:4px;margin-top:-10px;margin-bottom:12px}
        .pw-bar{flex:1;height:3px;border-radius:2px;background:var(--border);transition:background .3s}
        .err-box{background:#FEEEEE;border:1px solid rgba(200,64,64,0.25);border-radius:8px;padding:10px 14px;font-size:12px;color:#A03030;margin-bottom:16px;display:flex;gap:8px;align-items:center}
        .divider-or{display:flex;align-items:center;gap:12px;margin:20px 0;font-size:11px;color:var(--ink4)}
        .divider-or::before,.divider-or::after{content:'';flex:1;height:1px;background:var(--border)}
      `}
      </style>

      <div className="lw" style={{display:'grid',gridTemplateColumns:'1fr',minHeight:'100vh'}}>
        {/* ── Left branding panel ── */}
        <div className="login-left">
          <div style={{position:'relative',zIndex:1,textAlign:'center',maxWidth:'380px'}}>
            <svg style={{width:'96px',height:'96px',marginBottom:'20px'}} viewBox="0 0 100 100" fill="none">
              <path d="M50 8 C30 8 18 22 20 40 C22 55 30 72 38 82 C42 88 46 92 50 92 C54 92 58 88 62 82 C70 72 78 55 80 40 C82 22 70 8 50 8Z" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.2)" strokeWidth="2"/>
              <path d="M50 10 C32 10 20 24 22 42 C24 57 32 74 40 84 C44 90 47 92 50 92" stroke="#4ABFB0" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
              <path d="M50 10 C68 10 80 24 78 42 C76 57 68 74 60 84 C56 90 53 92 50 92" stroke="rgba(255,255,255,0.5)" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
              <circle cx="50" cy="35" r="6" fill="#4ABFB0" opacity="0.9"/>
            </svg>
            <div style={{fontFamily:'var(--font-display)',fontSize:'clamp(26px,5vw,40px)',color:'white',lineHeight:1.1,marginBottom:'6px'}}>
              DentXcribe <span style={{color:'var(--teal)'}}>AI</span>
            </div>
            <div style={{fontSize:'12px',color:'rgba(255,255,255,0.5)',letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:'32px'}}>
              Dental Charting &amp; Scribing
            </div>
            {[
              {
                icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{color:'var(--teal)'}}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>,
                text: 'Live AI transcription with speaker diarisation',
                key: 'diarisation'
              },
              {
                icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{color:'var(--teal)'}}><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>,
                text: 'Automatic chart extraction with evidence citations',
                key: 'chart'
              },
              {
                icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{color:'var(--teal)'}}><line x1="12" x2="12" y1="1" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
                text: 'CDT code matching & revenue recovery audit',
                key: 'cdt'
              },
              {
                icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{color:'var(--teal)'}}><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
                text: 'HIPAA-compliant, encrypted, audit-ready',
                key: 'hipaa'
              },
            ].map(f => (
              <div key={f.key} className="login-feature">
                <div className="lf-icon">{f.icon}</div>
                <div style={{fontSize:'13px',color:'rgba(255,255,255,0.7)',lineHeight:1.4,textAlign:'left'}}>{f.text}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right form panel ── */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'40px 24px',background:'var(--white)'}}>
          <div style={{width:'100%',maxWidth:'420px'}}>
            {/* Logo small */}
            <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'28px'}}>
              <svg width="30" height="30" viewBox="0 0 100 100" fill="none">
                <path d="M50 10 C32 10 20 24 22 42 C24 57 32 74 40 84 C44 90 47 92 50 92" stroke="#4ABFB0" strokeWidth="5" strokeLinecap="round" fill="none"/>
                <path d="M50 10 C68 10 80 24 78 42 C76 57 68 74 60 84 C56 90 53 92 50 92" stroke="#1B3A6B" strokeWidth="5" strokeLinecap="round" fill="none"/>
                <circle cx="50" cy="35" r="6" fill="#4ABFB0"/>
              </svg>
              <div>
                <div style={{fontFamily:'var(--font-display)',fontSize:'16px',color:'var(--navy)'}}>DentXcribe <span style={{color:'var(--teal)'}}>AI</span></div>
                <div style={{fontSize:'9px',color:'var(--ink3)',letterSpacing:'0.1em',textTransform:'uppercase'}}>Dental Charting &amp; Scribing</div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{display:'flex',borderBottom:'1px solid var(--border)',marginBottom:'24px'}}>
              <button className={`auth-tab${tab==='login'?' active':''}`} onClick={() => {setTab('login');setError('')}}>Sign In</button>
              <button className={`auth-tab${tab==='register'?' active':''}`} onClick={() => {setTab('register');setError('')}}>Create Account</button>
            </div>

            {/* Error */}
            {error && (
              <div className="err-box">
                <span style={{fontWeight:'bold'}}>[!]</span> {error}
              </div>
            )}

            {/* ── LOGIN FORM ── */}
            {tab === 'login' && (
              <form onSubmit={handleLogin}>
                <div style={{fontFamily:'var(--font-display)',fontSize:'24px',color:'var(--navy)',marginBottom:'4px'}}>Welcome back</div>
                <div style={{fontSize:'13px',color:'var(--ink3)',marginBottom:'16px'}}>Sign in to your practice account</div>

                {/* Demo Credentials Info Banner */}
                <div style={{
                  background: 'rgba(74, 191, 176, 0.08)',
                  border: '1px solid rgba(74, 191, 176, 0.25)',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  fontSize: '12px',
                  lineHeight: '1.5',
                  color: '#1b6b61',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px'
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginTop:'2px',flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                  <div>
                    <div style={{ fontWeight: '700', marginBottom: '2px' }}>Demo Credentials (Pre-filled):</div>
                    <div>Email: <strong style={{ userSelect: 'all' }}>dr.kim@brightsmile.com</strong></div>
                    <div>Password: <strong style={{ userSelect: 'all' }}>Demo@12345</strong></div>
                  </div>
                </div>

                <label className="form-label">Practice email</label>
                <input
                  className="form-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@practice.com"
                  required
                  autoComplete="email"
                />

                <label className="form-label">Password</label>
                <div className="input-wrap">
                  <input
                    className="form-input"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Password"
                    required
                    autoComplete="current-password"
                    style={{width:'100%'}}
                  />
                  <button type="button" className="eye-btn" onClick={() => setShowPassword(s => !s)}>
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>

                <div style={{textAlign:'right',marginTop:'-8px',marginBottom:'20px'}}>
                  <a style={{fontSize:'12px',color:'var(--teal-dark)',cursor:'pointer',textDecoration:'none'}}>Forgot password?</a>
                </div>

                <button className="btn-primary" type="submit" disabled={loading} style={{opacity:loading?0.7:1}}>
                  {loading ? 'Signing in…' : 'Sign In to Practice'}
                </button>
                <button
                  type="button"
                  className="btn-outline"
                  style={{marginTop:'10px'}}
                  onClick={async () => {
                    setLoading(true);
                    setError('');
                    try {
                      await login('dr.kim@brightsmile.com', 'Demo@12345');
                      router.push('/dashboard');
                    } catch (err: unknown) {
                      setError(err instanceof Error ? err.message : 'Demo login failed');
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  Enter Demo App
                </button>
                <div className="divider-or">or</div>
                <button type="button" className="btn-outline" onClick={() => setTab('register')}>Create a New Account</button>
              </form>
            )}

            {/* ── REGISTER FORM ── */}
            {tab === 'register' && (
              <form onSubmit={handleRegister}>
                <div style={{fontFamily:'var(--font-display)',fontSize:'24px',color:'var(--navy)',marginBottom:'4px'}}>Create account</div>
                <div style={{fontSize:'13px',color:'var(--ink3)',marginBottom:'24px'}}>Set up your practice on DentXcribe AI</div>

                <label className="form-label">Full name</label>
                <input className="form-input" type="text" value={regName} onChange={e => setRegName(e.target.value)} placeholder="Dr. Jane Smith" required autoComplete="name"/>

                <label className="form-label">Practice email</label>
                <input className="form-input" type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="you@practice.com" required autoComplete="email"/>

                <label className="form-label">Practice name <span style={{color:'var(--ink4)',fontWeight:400}}>(optional)</span></label>
                <input className="form-input" type="text" value={regPractice} onChange={e => setRegPractice(e.target.value)} placeholder="Bright Smile Dental"/>

                <label className="form-label">Password</label>
                <div className="input-wrap">
                  <input className="form-input" type={showPassword?'text':'password'} value={regPassword} onChange={e => setRegPassword(e.target.value)} placeholder="Min 8 chars, upper, digit, symbol" required autoComplete="new-password" style={{width:'100%'}}/>
                  <button type="button" className="eye-btn" onClick={() => setShowPassword(s => !s)}>{showPassword?'Hide':'Show'}</button>
                </div>
                {/* Strength indicator */}
                <PasswordStrength password={regPassword} />

                <label className="form-label">Confirm password</label>
                <input className="form-input" type={showPassword?'text':'password'} value={regConfirm} onChange={e => setRegConfirm(e.target.value)} placeholder="Repeat password" required autoComplete="new-password"/>

                <div style={{fontSize:'11px',color:'var(--ink3)',marginBottom:'20px',lineHeight:1.5}}>
                  By creating an account you agree to our <a style={{color:'var(--teal-dark)',cursor:'pointer'}}>Terms of Service</a> and <a style={{color:'var(--teal-dark)',cursor:'pointer'}}>Privacy Policy</a>. Your data is HIPAA-compliant and encrypted at rest.
                </div>

                <button className="btn-primary" type="submit" disabled={loading} style={{opacity:loading?0.7:1}}>
                  {loading ? 'Creating account…' : 'Create Account'}
                </button>
                <div className="divider-or">or</div>
                <button type="button" className="btn-outline" onClick={() => setTab('login')}>Already have an account</button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Password strength meter ── */
function passwordScore(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(pw)) s++;
  return s;
}

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const score = passwordScore(password);
  const colors = ['#E53E3E', '#C07010', '#4ABFB0', '#1A9060'];
  const labels = ['Weak', 'Fair', 'Good', 'Strong'];
  return (
    <div style={{marginTop:'-10px',marginBottom:'12px'}}>
      <div className="pw-strength">
        {[0,1,2,3].map(i => (
          <div key={i} className="pw-bar" style={{background: i < score ? colors[score-1] : 'var(--border)'}}/>
        ))}
      </div>
      <div style={{fontSize:'10px',color:colors[score-1]||'var(--ink4)',fontWeight:600}}>{labels[score-1] || 'Too weak'}</div>
    </div>
  );
}
