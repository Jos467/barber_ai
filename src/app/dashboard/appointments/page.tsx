'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import {
  Plus,
  Search,
  Phone,
  MessageCircle,
  Monitor,
  Globe,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import type { Appointment, Barber, Service } from '@/lib/types'

const statusConfig = {
  confirmed: { label: 'Confirmada', class: 'badge-confirmed' },
  completed: { label: 'Completada', class: 'badge-completed' },
  pending: { label: 'Pendiente', class: 'badge-pending' },
  cancelled: { label: 'Cancelada', class: 'badge-cancelled' },
}

const sourceIcons = {
  voice: { icon: Phone, color: 'text-purple-400', label: 'Voz IA' },
  whatsapp: { icon: MessageCircle, color: 'text-green-400', label: 'WhatsApp' },
  manual: { icon: Monitor, color: 'text-blue-400', label: 'Manual' },
  web: { icon: Globe, color: 'text-orange-400', label: 'Web' },
}

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [businessId, setBusinessId] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [filterDate, setFilterDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [showAllDates, setShowAllDates] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    barber_id: '',
    service_id: '',
    scheduled_at: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(
    async (bizId: string, date?: string) => {
      const supabase = createClient()
      const targetDate = date || filterDate

      let appointmentsQuery = supabase
        .from('appointments')
        .select(
          '*, barber:barbers(id,name), customer:customers(id,name,phone), service:services(id,name,price)'
        )
        .eq('business_id', bizId)

      if (!showAllDates) {
        const start = `${targetDate}T00:00:00`
        const end = `${targetDate}T23:59:59`

        appointmentsQuery = appointmentsQuery
          .gte('scheduled_at', start)
          .lte('scheduled_at', end)
      }

      const [aptsRes, barbersRes, servicesRes] = await Promise.all([
        appointmentsQuery.order('scheduled_at', { ascending: true }),
        supabase.from('barbers').select('*').eq('business_id', bizId).eq('active', true),
        supabase.from('services').select('*').eq('business_id', bizId).eq('active', true),
      ])

      if (aptsRes.data) setAppointments(aptsRes.data as unknown as Appointment[])
      if (barbersRes.data) setBarbers(barbersRes.data)
      if (servicesRes.data) setServices(servicesRes.data)

      setLoading(false)
    },
    [filterDate, showAllDates]
  )

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

      setBusinessId(biz.id)
      loadData(biz.id)

      const channel = supabase
        .channel('appointments-page-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'appointments',
            filter: `business_id=eq.${biz.id}`,
          },
          () => loadData(biz.id)
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
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
        .insert({
          business_id: businessId,
          name: form.customer_name,
          phone: form.customer_phone,
        })
        .select('id')
        .single()

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

      const citaDate = form.scheduled_at.slice(0, 10)
      setFilterDate(citaDate)
      setShowAllDates(false)

      setShowModal(false)
      setForm({
        customer_name: '',
        customer_phone: '',
        barber_id: '',
        service_id: '',
        scheduled_at: '',
        notes: '',
      })
      setSaving(false)

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
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-syne text-2xl font-bold text-white lg:text-3xl">Citas</h1>
          <p className="mt-1 text-sm text-gray-500">Gestiona todas las citas del negocio</p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-orange-400"
        >
          <Plus className="h-4 w-4" /> Nueva cita
        </button>
      </div>

      <div className="glass mb-6 rounded-2xl p-4">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_220px_220px_180px]">
          <div className="flex min-w-[160px] flex-1 items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
            <Search className="h-4 w-4 text-gray-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="w-full bg-transparent text-sm text-white outline-none placeholder-gray-600"
            />
          </div>

          <input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            disabled={showAllDates}
            className={`rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-orange-500/50 ${
              showAllDates ? 'cursor-not-allowed opacity-50' : ''
            }`}
          />

          <div className="relative">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="w-full appearance-none rounded-2xl border border-white/10 bg-[#111114] px-4 py-3 pr-10 text-sm text-white outline-none transition-all duration-200 hover:border-orange-400/30 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
            >
              <option value="" className="text-white">
                Todos los estados
              </option>
              <option value="confirmed" className="text-white">
                Confirmadas
              </option>
              <option value="pending" className="text-white">
                Pendientes
              </option>
              <option value="completed" className="text-white">
                Completadas
              </option>
              <option value="cancelled" className="text-white">
                Canceladas
              </option>
            </select>

            <svg
              className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-transform duration-200"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          <button
            type="button"
            onClick={() => setShowAllDates(prev => !prev)}
            className={`rounded-2xl border px-4 py-3 text-sm font-medium transition-all ${
              showAllDates
                ? 'border-orange-500/30 bg-orange-500/10 text-orange-400'
                : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/8'
            }`}
          >
            {showAllDates ? 'Viendo todas' : 'Todas las fechas'}
          </button>
        </div>
      </div>

      <div className="glass overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">
                  {showAllDates ? 'Fecha y hora' : 'Hora'}
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">
                  Cliente
                </th>
                <th className="hidden px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 md:table-cell">
                  Barbero
                </th>
                <th className="hidden px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 lg:table-cell">
                  Servicio
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">
                  Canal
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">
                  Acciones
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    Cargando...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    No hay citas para este filtro
                  </td>
                </tr>
              ) : (
                filtered.map(apt => {
                  const src = sourceIcons[apt.source] || sourceIcons.manual
                  const SrcIcon = src.icon
                  const status = statusConfig[apt.status] || statusConfig.pending

                  return (
                    <tr key={apt.id} className="transition-colors hover:bg-white/[0.02]">
                      <td className="px-6 py-4 font-syne font-bold text-white">
                        {showAllDates ? (
                          <div>
                            <p>{format(new Date(apt.scheduled_at), 'dd/MM/yyyy')}</p>
                            <p className="text-xs font-normal text-gray-500">
                              {format(new Date(apt.scheduled_at), 'HH:mm')}
                            </p>
                          </div>
                        ) : (
                          format(new Date(apt.scheduled_at), 'HH:mm')
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <p className="text-sm text-white">{(apt.customer as any)?.name}</p>
                        <p className="text-xs text-gray-500">{(apt.customer as any)?.phone}</p>
                      </td>

                      <td className="hidden px-6 py-4 text-sm text-gray-300 md:table-cell">
                        {(apt.barber as any)?.name}
                      </td>

                      <td className="hidden px-6 py-4 text-sm text-gray-300 lg:table-cell">
                        {(apt.service as any)?.name}
                      </td>

                      <td className="px-6 py-4">
                        <div className={`flex items-center gap-1.5 text-xs ${src.color}`}>
                          <SrcIcon className="h-3.5 w-3.5" />
                          <span className="hidden sm:block">{src.label}</span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.class}`}
                        >
                          {status.label}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          {apt.status !== 'completed' && apt.status !== 'cancelled' && (
                            <>
                              <button
                                onClick={() => updateStatus(apt.id, 'completed')}
                                className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-emerald-500/10 hover:text-emerald-400"
                                title="Completar"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </button>

                              <button
                                onClick={() => updateStatus(apt.id, 'cancelled')}
                                className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                                title="Cancelar"
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />

          <div className="glass animate-fade-up relative w-full max-w-md rounded-2xl p-6">
            <h3 className="mb-5 text-lg font-bold text-white">Nueva cita manual</h3>

            <div className="space-y-3">
              {[
                {
                  label: 'Nombre del cliente',
                  key: 'customer_name',
                  type: 'text',
                  placeholder: 'Roberto Herrera',
                },
                {
                  label: 'Teléfono',
                  key: 'customer_phone',
                  type: 'tel',
                  placeholder: '+504 9999-0000',
                },
                {
                  label: 'Fecha y hora',
                  key: 'scheduled_at',
                  type: 'datetime-local',
                  placeholder: '',
                },
                {
                  label: 'Notas',
                  key: 'notes',
                  type: 'text',
                  placeholder: 'Opcional...',
                },
              ].map(f => (
                <div key={f.key}>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-gray-400">
                    {f.label}
                  </label>
                  <input
                    type={f.type}
                    value={(form as any)[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none placeholder-gray-600 focus:border-orange-500/50"
                  />
                </div>
              ))}

              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-gray-400">
                  Barbero
                </label>
                <select
                  value={form.barber_id}
                  onChange={e => setForm(p => ({ ...p, barber_id: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-orange-500/50"
                >
                  <option value="">Seleccionar barbero</option>
                  {barbers.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-gray-400">
                  Servicio
                </label>
                <select
                  value={form.service_id}
                  onChange={e => setForm(p => ({ ...p, service_id: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-orange-500/50"
                >
                  <option value="">Seleccionar servicio</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} — L.{s.price}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-gray-400 transition-colors hover:text-white"
              >
                Cancelar
              </button>

              <button
                onClick={handleNewAppointment}
                disabled={
                  saving ||
                  !form.customer_name ||
                  !form.barber_id ||
                  !form.service_id ||
                  !form.scheduled_at
                }
                className="flex-1 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-orange-400 disabled:opacity-50"
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