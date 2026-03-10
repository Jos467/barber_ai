'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Calendar, CheckCircle2, Clock, XCircle, Phone, MessageCircle, Monitor, Globe } from 'lucide-react'
import type { Appointment } from '@/lib/types'

const statusConfig = {
  confirmed:  { label: 'Confirmada',  class: 'badge-confirmed' },
  completed:  { label: 'Completada',  class: 'badge-completed' },
  pending:    { label: 'Pendiente',   class: 'badge-pending'   },
  cancelled:  { label: 'Cancelada',   class: 'badge-cancelled' },
}

const sourceConfig = {
  voice:    { label: 'Voz IA',   icon: Phone,         color: 'text-purple-400' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: 'text-green-400'  },
  manual:   { label: 'Manual',   icon: Monitor,       color: 'text-blue-400'   },
  web:      { label: 'Web',      icon: Globe,         color: 'text-orange-400' },
}

export default function DashboardHome() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const loadAppointments = useCallback(async (bizId: string) => {
    const supabase = createClient()
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0).toISOString()
    const end   = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString()

    const { data } = await supabase
      .from('appointments')
      .select('*, barber:barbers(id,name), customer:customers(id,name,phone), service:services(id,name,price)')
      .eq('business_id', bizId)
      .gte('scheduled_at', start)
      .lte('scheduled_at', end)
      .order('scheduled_at', { ascending: true })

    if (data) {
      setAppointments(data as unknown as Appointment[])
      setLastUpdate(new Date())
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: biz } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', data.user.id)
        .single()

      if (!biz) return
      await loadAppointments(biz.id)

      // 🔴 REALTIME — cuando n8n o Vapi creen una cita, aparece al instante
      const channel = supabase
        .channel('appointments-realtime')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `business_id=eq.${biz.id}`,
        }, () => {
          loadAppointments(biz.id)
        })
        .subscribe()

      return () => { supabase.removeChannel(channel) }
    })
  }, [loadAppointments])

  const metrics = {
    total:     appointments.length,
    completed: appointments.filter(a => a.status === 'completed').length,
    pending:   appointments.filter(a => a.status === 'pending' || a.status === 'confirmed').length,
    cancelled: appointments.filter(a => a.status === 'cancelled').length,
  }

  const MetricCard = ({ label, value, color, icon: Icon }: {
    label: string, value: number, color: string, icon: any
  }) => (
    <div className="glass rounded-2xl p-5 animate-fade-up">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">{label}</span>
        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
      </div>
      <p className={`text-3xl font-syne font-bold ${color}`}>{value}</p>
    </div>
  )

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-orange-400 text-sm font-medium mb-1">
            {format(new Date(), "EEEE, d 'de' MMMM", { locale: es })}
          </p>
          <h1 className="font-syne text-2xl lg:text-3xl font-bold text-white">Panel de control</h1>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
          {lastUpdate ? `Actualizado ${format(lastUpdate, 'HH:mm:ss')}` : 'En tiempo real'}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Citas hoy"   value={metrics.total}     color="text-white"       icon={Calendar}     />
        <MetricCard label="Completadas" value={metrics.completed} color="text-emerald-400" icon={CheckCircle2} />
        <MetricCard label="Pendientes"  value={metrics.pending}   color="text-amber-400"   icon={Clock}        />
        <MetricCard label="Canceladas"  value={metrics.cancelled} color="text-red-400"     icon={XCircle}      />
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h2 className="font-syne font-semibold text-white">Citas de hoy</h2>
          <span className="text-xs text-gray-500 bg-white/5 px-2.5 py-1 rounded-full">
            {appointments.length} citas
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
            Cargando citas...
          </div>
        ) : appointments.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No hay citas programadas para hoy</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {appointments.map((apt, i) => {
              const status = statusConfig[apt.status] || statusConfig.pending
              const source = sourceConfig[apt.source] || sourceConfig.manual
              const SourceIcon = source.icon

              return (
                <div
                  key={apt.id}
                  className="px-6 py-4 hover:bg-white/2 transition-colors animate-fade-up flex items-center gap-4"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="w-14 text-center flex-shrink-0">
                    <p className="font-syne font-bold text-white text-lg leading-none">
                      {format(new Date(apt.scheduled_at), 'HH:mm')}
                    </p>
                  </div>

                  <div className="w-px h-10 bg-white/10 flex-shrink-0" />

                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm truncate">
                      {(apt.customer as any)?.name || 'Cliente'}
                    </p>
                    <p className="text-gray-500 text-xs mt-0.5 truncate">
                      {(apt.service as any)?.name} · {(apt.barber as any)?.name}
                    </p>
                  </div>

                  <div className={`hidden sm:flex items-center gap-1.5 text-xs ${source.color}`}>
                    <SourceIcon className="w-3.5 h-3.5" />
                    <span className="hidden md:block">{source.label}</span>
                  </div>

                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${status.class}`}>
                    {status.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}