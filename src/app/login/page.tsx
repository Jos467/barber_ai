'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Scissors, Sparkles, ShieldCheck, CalendarDays } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')

  async function handleSubmit() {
    setLoading(true)
    setError('')
    const supabase = createClient()

    const result =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })

    if (result.error) {
      setError(result.error.message)
    } else {
      router.push('/dashboard')
      router.refresh()
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#09090b] relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -right-24 h-[420px] w-[420px] rounded-full bg-orange-500/10 blur-[110px]" />
        <div className="absolute -bottom-24 -left-24 h-[360px] w-[360px] rounded-full bg-orange-400/10 blur-[110px]" />
      </div>

      <div className="relative min-h-screen grid lg:grid-cols-2">
        <section className="hidden lg:flex flex-col justify-between px-10 py-10 xl:px-16">
          <div>
            <div className="inline-flex items-center gap-3 rounded-2xl border border-orange-500/20 bg-orange-500/10 px-4 py-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/15 border border-orange-500/20">
                <Scissors className="h-5 w-5 text-orange-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">BarberAI</p>
                <p className="text-xs text-gray-400">Gestión moderna para barberías</p>
              </div>
            </div>
          </div>

          <div className="max-w-xl">
            <p className="mb-3 text-sm font-medium uppercase tracking-[0.22em] text-orange-400">
              Panel administrativo
            </p>

            <h1 className="text-5xl font-extrabold leading-tight text-white">
              Una barbería más rápida asistente IA.
            </h1>

            <p className="mt-5 max-w-lg text-base leading-7 text-gray-400">
              Controla citas, clientes, barberos y servicios desde una interfaz elegante y
              clara
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                {
                  icon: CalendarDays,
                  title: 'Citas',
                  text: 'Agenda diaria clara y organizada.',
                },
                {
                  icon: ShieldCheck,
                  title: 'Control',
                  text: 'Gestión del negocio desde un solo lugar.',
                },
                {
                  icon: Sparkles,
                  title: 'IA Ready',
                  text: 'Base visual lista para tu asistente.',
                },
              ].map(({ icon: Icon, title, text }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/5">
                    <Icon className="h-4 w-4 text-orange-400" />
                  </div>
                  <p className="font-semibold text-white">{title}</p>
                  <p className="mt-1 text-sm text-gray-400">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-600">
            UNICAH Feria de Ciencias 2026 · Programación de Negocios
          </p>
        </section>

        <section className="flex items-center justify-center px-4 py-8 sm:px-6 lg:px-10">
          <div className="w-full max-w-md">
            <div className="mb-6 text-center lg:hidden">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-orange-500/20 bg-orange-500/10">
                <Scissors className="h-8 w-8 text-orange-400" />
              </div>
              <h1 className="text-3xl font-bold text-white">BarberAI</h1>
              <p className="mt-1 text-sm text-gray-500">Panel de gestión para barbería</p>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-8">
              <div className="mb-7">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-400">
                  {mode === 'login' ? 'Acceso seguro' : 'Registro'}
                </p>

                <h2 className="mt-2 text-2xl font-bold text-white">
                  {mode === 'login' ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}
                </h2>

                <p className="mt-2 text-sm text-gray-400">
                  {mode === 'login'
                    ? 'Entra al dashboard y continúa gestionando tu barbería.'
                    : 'Registra tu cuenta para comenzar a usar el sistema.'}
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
                  />
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full rounded-2xl bg-gradient-to-r from-orange-500 to-orange-400 px-4 py-3.5 font-bold text-white transition hover:brightness-105 disabled:opacity-60"
                >
                  {loading
                    ? 'Cargando...'
                    : mode === 'login'
                      ? 'Entrar al dashboard'
                      : 'Crear cuenta'}
                </button>
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-400">
                {mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
                <button
                  onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                  className="font-semibold text-orange-400 hover:text-orange-300"
                >
                  {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
                </button>
              </div>
            </div>

            <p className="mt-5 text-center text-xs text-gray-600 lg:hidden">
              UNICAH Feria de Ciencias 2026 · Programación de Negocios
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}