'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { Plus, Search, Phone, MessageCircle, Monitor, Globe, CheckCircle2, XCircle } from 'lucide-react'
import type { Appointment, Barber, Service } from '@/lib/types'

const statusConfig = {
  confirmed: { label: 'Confirmada', class: 'badge-confirmed' },
  completed: { label: 'Completada', class: 'badge-completed' },
  pending:   { label: 'Pendiente',  class: 'badge-pending'   },
  cancelled: { label: 'Cancelada',  class: 'badge-cancelled' },
}

const sourceIcons = {
  voice:    { icon: Phone,         color: 'text-purple-400', label: 'Voz IA'   },
  whatsapp: { icon: MessageCircle, color: 'text-green-400',  label: 'WhatsApp' },
  manual:   { icon: Monitor,       color: 'text-blue-400',   label: 'Manual'   },
  web:      { icon: Globe,         color: 'text-orange-400', label: 'Web'      },
}

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [businessId, setBusinessId] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [filterDate, setFilterDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    customer_name: '', customer_phone: '', barber_id: '',
    service_id: '', scheduled_at: '', notes: ''
  })
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async (bizId: string, date?: string) => {
    const supabase = createClient()
    const targetDate = date || filterDate

    // Usar rango amplio para no perder citas por timezone
    const start = `${targetDate}T00:00:00`
    const end   = `${targetDate}T23:59:59`

    const [aptsRes, barbersRes, servicesRes] = await Promise.all([
      supabase.from('appointments')
        .select('*, barber:barbers(id,name), customer:customers(id,name,phone), service:services(id,name,price)')
        .eq('business_id', bizId)
        .gte('scheduled_at', start)
        .lte('scheduled_at', end)
        .order('scheduled_at', { ascending: true }),
      supabase.from('barbers').select('*').eq('business_id', bizId).eq('active', true),
      supabase.from('services').select('*').eq('business_id', bizId).eq('active', true),
    ])

    if (aptsRes.data) setAppointments(aptsRes.data as unknown as Appointment[])
    if (barbersRes.data) setBarbers(barbersRes.data)
    if (servicesRes.data) setServices(servicesRes.data)
    setLoading(false)
  }, [filterDate])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: biz } = await supabase
        .from('businesses').select('id').eq('owner_id', data.user.id).single()
      if (!biz) return
      setBusinessId(biz.id)
      loadData(biz.id)

      const channel = supabase
        .channel('appointments-page-realtime')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `business_id=eq.${biz.id}`,
        }, () => {
          loadData(biz.id)
        })
        .subscribe()

      return () => { supabase.removeChannel(channel) }
    })
  }, [loadData])

  async function handleNewAppointment() {
    if (!businessId) return
    setSaving(true)
    const supabase = createClient()

    let customerId: string | null = null
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('business_id', businessId)
      .eq('phone', form.customer_phone)
      .single()

    if (existing) {
      customerId = existing.id
    } else {
      const { data: newCust } = await supabase
        .from('customers')
        .insert({ business_id: businessId, name: form.customer_name, phone: form.customer_phone })
        .select('id').single()
      customerId = newCust?.id || null
    }

    if (customerId) {
      const service = services.find(s => s.id === form.service_id)
      const { error } = await supabase.from('appointments').insert({
        business_id: businessId,
        barber_id: form.barber_id,
        customer_id: customerId,
        service_id: form.service_id,
        scheduled_at: form.scheduled_at,
        duration_minutes: service?.duration_minutes || 30,
        status: 'confirmed',
        source: 'manual',
        notes: form.notes,
      })

      if (error) {
        console.error('Error al crear cita:', error.message)
        setSaving(false)
        return
      }

      // Cambiar el filtro de fecha a la fecha de la cita creada
      const citaDate = form.scheduled_at.slice(0, 10)
      setFilterDate(citaDate)

      setShowModal(false)
      setForm({ customer_name: '', customer_phone: '', barber_id: '', service_id: '', scheduled_at: '', notes: '' })
      setSaving(false)

      // Recargar con la fecha de la cita recién creada
      setTimeout(() => loadData(businessId, citaDate), 600)
      return
    }

    setSaving(false)
  }

  async function updateStatus(id: string, status: string) {
    const supabase = createClient()
    await supabase.from('appointments').update({ status }).eq('id', id)
    loadData(businessId)
  }

  const filtered = appointments.filter(a => {
    const name = ((a.customer as any)?.name || '').toLowerCase()
    const matchSearch = !search || name.includes(search.toLowerCase())
    const matchStatus = !filterStatus || a.status === filterStatus
    return matchSearch && matchStatus
  })

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-syne text-2xl lg:text-3xl font-bold text-white">Citas</h1>
          <p className="text-gray-500 text-sm mt-1">Gestiona todas las citas del negocio</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all"
        >
          <Plus className="w-4 h-4" /> Nueva cita
        </button>
      </div>

      <div className="glass rounded-2xl p-4 mb-6 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 flex-1 min-w-[160px]">
          <Search className="w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cliente..."
            className="bg-transparent text-white text-sm outline-none w-full placeholder-gray-600"
          />
        </div>
        <input
          type="date"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-orange-500/50"
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-orange-500/50"
        >
          <option value="">Todos los estados</option>
          <option value="confirmed">Confirmadas</option>
          <option value="pending">Pendientes</option>
          <option value="completed">Completadas</option>
          <option value="cancelled">Canceladas</option>
        </select>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left text-xs text-gray-500 uppercase tracking-wider px-6 py-3">Hora</th>
                <th className="text-left text-xs text-gray-500 uppercase tracking-wider px-6 py-3">Cliente</th>
                <th className="text-left text-xs text-gray-500 uppercase tracking-wider px-6 py-3 hidden md:table-cell">Barbero</th>
                <th className="text-left text-xs text-gray-500 uppercase tracking-wider px-6 py-3 hidden lg:table-cell">Servicio</th>
                <th className="text-left text-xs text-gray-500 uppercase tracking-wider px-6 py-3">Canal</th>
                <th className="text-left text-xs text-gray-500 uppercase tracking-wider px-6 py-3">Estado</th>
                <th className="text-left text-xs text-gray-500 uppercase tracking-wider px-6 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">No hay citas para este filtro</td></tr>
              ) : filtered.map(apt => {
                const src = sourceIcons[apt.source] || sourceIcons.manual
                const SrcIcon = src.icon
                const status = statusConfig[apt.status] || statusConfig.pending
                return (
                  <tr key={apt.id} className="hover:bg-white/2 transition-colors">
                    <td className="px-6 py-4 text-white font-syne font-bold">
                      {format(new Date(apt.scheduled_at), 'HH:mm')}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-white text-sm">{(apt.customer as any)?.name}</p>
                      <p className="text-gray-500 text-xs">{(apt.customer as any)?.phone}</p>
                    </td>
                    <td className="px-6 py-4 text-gray-300 text-sm hidden md:table-cell">
                      {(apt.barber as any)?.name}
                    </td>
                    <td className="px-6 py-4 text-gray-300 text-sm hidden lg:table-cell">
                      {(apt.service as any)?.name}
                    </td>
                    <td className="px-6 py-4">
                      <div className={`flex items-center gap-1.5 text-xs ${src.color}`}>
                        <SrcIcon className="w-3.5 h-3.5" />
                        <span className="hidden sm:block">{src.label}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${status.class}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1">
                        {apt.status !== 'completed' && apt.status !== 'cancelled' && (
                          <>
                            <button
                              onClick={() => updateStatus(apt.id, 'completed')}
                              className="p-1.5 hover:bg-emerald-500/10 rounded-lg text-gray-500 hover:text-emerald-400 transition-colors"
                              title="Completar"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => updateStatus(apt.id, 'cancelled')}
                              className="p-1.5 hover:bg-red-500/10 rounded-lg text-gray-500 hover:text-red-400 transition-colors"
                              title="Cancelar"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative glass rounded-2xl p-6 w-full max-w-md animate-fade-up">
            <h3 className="font-syne font-bold text-white text-lg mb-5">Nueva cita manual</h3>
            <div className="space-y-3">
              {[
                { label: 'Nombre del cliente', key: 'customer_name',  type: 'text',           placeholder: 'Roberto Herrera' },
                { label: 'Teléfono',           key: 'customer_phone', type: 'tel',            placeholder: '+504 9999-0000'  },
                { label: 'Fecha y hora',       key: 'scheduled_at',   type: 'datetime-local', placeholder: ''               },
                { label: 'Notas',              key: 'notes',          type: 'text',           placeholder: 'Opcional...'    },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">{f.label}</label>
                  <input
                    type={f.type}
                    value={(form as any)[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-orange-500/50 placeholder-gray-600"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Barbero</label>
                <select
                  value={form.barber_id}
                  onChange={e => setForm(p => ({ ...p, barber_id: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-orange-500/50"
                >
                  <option value="">Seleccionar barbero</option>
                  {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Servicio</label>
                <select
                  value={form.service_id}
                  onChange={e => setForm(p => ({ ...p, service_id: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-orange-500/50"
                >
                  <option value="">Seleccionar servicio</option>
                  {services.map(s => <option key={s.id} value={s.id}>{s.name} — L.{s.price}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleNewAppointment}
                disabled={saving || !form.customer_name || !form.barber_id || !form.service_id || !form.scheduled_at}
                className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-2.5 text-sm transition-all"
              >
                {saving ? 'Guardando...' : 'Crear cita'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}