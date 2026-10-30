'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createEmployee, resetEmployeePassword, updateEmployee, setEmployeeActive } from '@/lib/actions';
import { toast } from './ToastHost';
import PasswordInput from './PasswordInput';
type Role = { id: string; name: string };
const genPw = () => { const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'; const a = new Uint32Array(10); crypto.getRandomValues(a); return Array.from(a, n => c[n % c.length]).join(''); };
export function CreateEmployeeForm({ roles }: { roles: Role[] }) {
 const router=useRouter(); const [v,setV]=useState({username:'',fullName:'',roleId:roles[0]?.id||'',password:''}); const [busy,setBusy]=useState(false); const [err,setErr]=useState(''); const [made,setMade]=useState<any>(null); const lock=useRef(false);
 async function submit(e:React.FormEvent){e.preventDefault();if(lock.current)return;setErr('');if(!v.roleId){setErr('Create a staff role before adding an employee.');return;}if(v.password.length<8){setErr('Temporary password must be at least 8 characters.');return;}lock.current=true;setBusy(true);const r=await createEmployee(v).catch(()=>({ok:false,error:'Could not reach the server.'} as any));lock.current=false;setBusy(false);if(r.ok){setMade({...v,id:r.data});toast('Employee created');router.refresh();}else setErr(r.error||'Could not create the employee');}
 if(made)return <div className="card"><div className="alert ok"><b>{made.fullName} can now sign in.</b></div><p>Give them these details (they must choose a new password at first sign-in):</p><div className="metric"><div>Username: <b>{made.username.toLowerCase()}</b></div><div>Temporary password: <b>{made.password}</b></div></div><p className="muted">This password is shown only now and is not stored anywhere readable.</p><button className="btn" onClick={()=>router.push('/employees')}>Done</button></div>;
 return <form onSubmit={submit} className="card"><div className="grid g2">
  <div className="field"><label>Full name *</label><input value={v.fullName} onChange={e=>setV({...v,fullName:e.target.value})} required/></div>
  <div className="field"><label>Username * (used to sign in)</label><input autoCapitalize="none" value={v.username} onChange={e=>setV({...v,username:e.target.value})} required/><div className="help">3–32 letters, numbers, dot, dash, underscore.</div></div>
  <div className="field"><label>Role</label><select value={v.roleId} onChange={e=>setV({...v,roleId:e.target.value})} required>{roles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select><div className="help"><a href="/roles">Manage roles and permissions</a></div></div>
  <div className="field"><label>Temporary password *</label><div style={{display:'flex',gap:6}}><PasswordInput value={v.password} onChange={password=>setV({...v,password})} autoComplete="new-password" required/><button type="button" className="btn" onClick={()=>setV({...v,password:genPw()})}>Generate</button></div></div></div>
  {err&&<div className="alert bad" style={{marginTop:12}}>{err}</div>}<button className="btn primary" style={{marginTop:12}} disabled={busy||!roles.length}>{busy?'Creating…':'Create employee'}</button></form>;
}
export function EmployeeAdmin({e,roles}:{e:any;roles:Role[]}) {
 const router=useRouter();const [name,setName]=useState(e.full_name);const [roleId,setRoleId]=useState(e.role_id||roles[0]?.id||'');const [phone,setPhone]=useState(e.phone||'');const [busy,setBusy]=useState(false);const [pw,setPw]=useState('');
 async function save(){setBusy(true);const r=await updateEmployee(e.id,name,roleId,phone);setBusy(false);if(r.ok){toast('Saved');router.refresh();}else toast(r.error||'Could not save','bad');}
 async function reset(){if(pw.length<8){toast('Temporary password must be at least 8 characters','bad');return;}if(!window.confirm('Reset this employee password? They must choose a new one at next sign-in.'))return;setBusy(true);const r=await resetEmployeePassword(e.id,pw);setBusy(false);if(r.ok){toast('Password reset. Temporary password: '+pw);setPw('');}else toast(r.error||'Could not reset','bad');}
 async function toggle(){if(!window.confirm(e.active?'Deactivate this account? They will be signed out and unable to log in. Their history is kept.':'Re-activate this account?'))return;setBusy(true);const r=await setEmployeeActive(e.id,!e.active);setBusy(false);if(r.ok){toast(e.active?'Deactivated':'Activated');router.refresh();}else toast(r.error||'Could not change','bad');}
 return <div className="card"><h2>Account</h2><div className="grid g3"><div className="field"><label>Name</label><input value={name} onChange={ev=>setName(ev.target.value)}/></div>
 <div className="field"><label>Role</label><select value={roleId} onChange={ev=>setRoleId(ev.target.value)}>{roles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div><div className="field"><label>Phone</label><input value={phone} onChange={ev=>setPhone(ev.target.value)}/></div></div>
 <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10,alignItems:'end'}}><button className="btn primary" onClick={save} disabled={busy||!roleId}>Save</button>
 <div className="field" style={{flex:1,minWidth:200}}><label>New temporary password</label><div style={{display:'flex',gap:6}}><PasswordInput value={pw} onChange={setPw} autoComplete="new-password"/><button className="btn" onClick={()=>setPw(genPw())}>Generate</button><button className="btn" onClick={reset} disabled={busy}>Reset password</button></div></div>
 <button className={'btn '+(e.active?'danger':'primary')} onClick={toggle} disabled={busy}>{e.active?'Deactivate account':'Activate account'}</button></div></div>;
}
