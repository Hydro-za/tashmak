'use client';
import { useState } from 'react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  placeholder?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  minLength?: number;
};

export default function PasswordInput({ value, onChange, autoComplete = 'current-password', required, placeholder, id, name, disabled, minLength }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-control">
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        disabled={disabled}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        disabled={disabled}
      >
        {visible ? (
          <><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0112 5c5.2 0 8.8 5.1 9.5 6.2a1.5 1.5 0 010 1.6 15 15 0 01-3.1 3.5M6.2 6.2A15 15 0 002.5 11.2a1.5 1.5 0 000 1.6C3.2 13.9 6.8 19 12 19c1 0 1.9-.2 2.8-.6"/></svg><span>Hide</span></>
        ) : (
          <><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="2.7"/></svg><span>Show</span></>
        )}
      </button>
    </div>
  );
}
