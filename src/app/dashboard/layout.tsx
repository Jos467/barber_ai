'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Scissors, LayoutDashboard, Calendar, Users, UserCog,
  Settings, LogOut, Menu, X, Zap
} from 'lucide-react'

const navItems = [
  { href: '/dashboard',              label: 'Inicio',        icon: LayoutDashboard },
  { href: '/dashboard/appointments', label: 'Citas',         icon: Calendar },
  { href: '/dashboard/customers',    label: 'Clientes',      icon: Users },
  { href: '/dashboard/barbers',      label: 'Barberos',      icon: UserCog },
  { href: '/dashboard/settings',     label: 'Configuración', icon: Settings },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [businessName, setBusinessName] = useState('Barbería El Estilo')
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      setUserEmail(data.user.email || '')
      supabase
        .from('businesses')
        .select('name')
        .eq('owner_id', data.user.id)
        .single()
        .then(({ data: biz }) => { if (biz) setBusinessName(biz.name) })
    })
  }, [router])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      <div className="px-6 py-6 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <Scissors className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <p className="font-syne font-bold text-white text-sm leading-tight">BarberAI</p>
            <p className="text-[10px] text-gray-500 leading-tight">{businessName}</p>
          </div>
        </div>
      </div>

      <div className="mx-4 mt-4 px-3 py-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
        <span className="text-xs text-emerald-400 font-medium">Agentes IA activos</span>
        <Zap className="w-3 h-3 text-emerald-400 ml-auto" />
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === '/dashboard' ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                active
                  ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-white/5">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-xs">
            {userEmail.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white truncate">{userEmail}</p>
            <p className="text-[10px] text-gray-500">Administrador</p>
          </div>
          <button onClick={handleLogout} className="text-gray-500 hover:text-red-400 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-[#0a0a0f]">
      <aside className="hidden lg:flex flex-col w-64 bg-[#111118] border-r border-white/5 flex-shrink-0">
        <Sidebar />
      </aside>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/70" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-64 bg-[#111118] border-r border-white/5 flex flex-col">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <Sidebar />
          </aside>
        </div>
      )}

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-[#111118] border-b border-white/5">
          <button onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5 text-gray-400" />
          </button>
          <span className="font-syne font-bold text-white">BarberAI</span>
          <div className="w-5" />
        </header>

        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  )
}