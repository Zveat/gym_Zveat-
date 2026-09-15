'use client';

import { useState } from 'react';
import { Button, Card, Eyebrow, Notice, SegmentedControl } from '@/components/ui/primitives';
import { Field, TextInput } from '@/components/ui/inputs';
import { describeAuthError, register, signIn } from '@/data/firebase-app';

/**
 * The only screen shown before the data is known.
 *
 * Deliberately not skippable: with a cloud project configured, guessing which
 * account the device's cached data belongs to is how histories get merged into
 * the wrong place.
 */
export function SignInScreen() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'in') await signIn(email, password);
      else await register(email, password);
      // The auth listener in the store takes it from here.
    } catch (e) {
      setError(describeAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = email.trim().length > 3 && password.length >= 6;

  return (
    <main
      className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col justify-center px-5"
      style={{ paddingTop: 'calc(var(--safe-top) + 24px)', paddingBottom: 'calc(var(--safe-bottom) + 24px)' }}
    >
      <div className="mb-8">
        <Eyebrow>Personal Gym OS</Eyebrow>
        <h1 className="mt-2 text-[30px] leading-[1.1] font-semibold tracking-tight">
          {mode === 'in' ? 'Вход' : 'Регистрация'}
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-dim">
          Тренировки хранятся в вашем аккаунте, поэтому доступны с любого устройства. В зале
          приложение работает и без связи — записи уйдут на сервер, когда он появится.
        </p>
      </div>

      <SegmentedControl
        value={mode}
        onChange={(next) => {
          setMode(next);
          setError(null);
        }}
        options={[
          { value: 'in', label: 'Войти' },
          { value: 'up', label: 'Создать аккаунт' },
        ]}
      />

      <Card className="mt-3 flex flex-col gap-3.5 p-4">
        <Field label="Почта">
          <TextInput
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Пароль" hint={mode === 'up' ? 'Минимум 6 символов' : undefined}>
          <TextInput
            type="password"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSubmit && !busy) void submit();
            }}
            placeholder="••••••"
          />
        </Field>

        {error ? <Notice tone="warn">{error}</Notice> : null}

        <Button
          variant="primary"
          size="xl"
          full
          disabled={!canSubmit || busy}
          onClick={() => void submit()}
        >
          {busy ? 'ПОДОЖДИТЕ…' : mode === 'in' ? 'ВОЙТИ' : 'СОЗДАТЬ АККАУНТ'}
        </Button>
      </Card>
    </main>
  );
}
