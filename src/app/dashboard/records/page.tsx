'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import * as XLSX from 'xlsx'
import {
  Plus,
  Search,
  Phone,
  MessageCircle,
  Monitor,
  Globe,
  CheckCircle2,
  XCircle,
  ClipboardList,
  DollarSign,
  CalendarRange,
  Users,
  RotateCcw,
  Download,
} from 'lucide-react'
import type { Appointment, Barber, Service } from '@/lib/types'

const TZ = 'America/Tegucigalpa'

function formatDateTime(dateStr: string) {
  return format(toZonedTime(new Date(dateStr), TZ), 'dd/MM/yyyy HH:mm')
}

function formatDateInput(date = new Date()) {
  return format(date, 'yyyy-MM-dd')
}

function formatMoney(value: number) {
  return `L. ${Number(value || 0).toFixed(2)}`
}

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

async function getBusinessId(supabase: any, userId: string): Promise<string | null> {
  const { data: ownedBiz } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', userId)
    .single()

  if (ownedBiz) return ownedBiz.id

  const { data: memberBiz } = await supabase
    .from('business_members')
    .select('business_id')
    .eq('user_id', userId)
    .single()

  return memberBiz?.business_id || null
}

export default function RecordsPage() {
  const [records, setRecords] = useState<Appointment[]>([])
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [businessId, setBusinessId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const [filters, setFilters] = useState({
    from: formatDateInput(new Date(new Date().setDate(new Date().getDate() - 7))),
    to: formatDateInput(),
    status: '',
    source: '',
    barber_id: '',
    search: '',
  })

  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    barber_id: '',
    service_id: '',
    scheduled_at: '',
    notes: '',
  })

  const loadData = useCallback(async (bizId: string, activeFilters = filters) => {
    setLoading(true)
    const supabase = createClient()

    let query = supabase
      .from('appointments')
      .select(`
        *,
        barber:barbers(id,name),
        customer:customers(id,name,phone,email),
        service:services(id,name,price,duration_minutes)
      `)
      .eq('business_id', bizId)

    if (activeFilters.from) {
      query = query.gte('scheduled_at', `${activeFilters.from}T00:00:00`)
    }

    if (activeFilters.to) {
      query = query.lte('scheduled_at', `${activeFilters.to}T23:59:59`)
    }

    if (activeFilters.status) {
      query = query.eq('status', activeFilters.status)
    }

    if (activeFilters.source) {
      query = query.eq('source', activeFilters.source)
    }

    if (activeFilters.barber_id) {
      query = query.eq('barber_id', activeFilters.barber_id)
    }

    const [recordsRes, barbersRes, servicesRes] = await Promise.all([
      query.order('scheduled_at', { ascending: false }),
      supabase.from('barbers').select('*').eq('business_id', bizId).eq('active', true),
      supabase.from('services').select('*').eq('business_id', bizId).eq('active', true),
    ])

    if (recordsRes.data) setRecords(recordsRes.data as unknown as Appointment[])
    if (barbersRes.data) setBarbers(barbersRes.data)
    if (servicesRes.data) setServices(servicesRes.data)

    setLoading(false)
  }, [filters])

  useEffect(() => {
    const supabase = createClient()
    let mounted = true
    let cleanup: (() => void) | undefined

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user || !mounted) return

      const bizId = await getBusinessId(supabase, data.user.id)
      if (!bizId || !mounted) return

      setBusinessId(bizId)
      await loadData(bizId, filters)

      const channel = supabase
        .channel('records-page-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'appointments',
            filter: `business_id=eq.${bizId}`,
          },
          () => loadData(bizId, filters)
        )
        .subscribe()

      cleanup = () => {
        supabase.removeChannel(channel)
      }
    })

    return () => {
      mounted = false
      cleanup?.()
    }
  }, [loadData, filters])

  async function handleNewRecord() {
    if (!businessId) return

    setSaving(true)
    const supabase = createClient()

    let customerId: string | null = null

    const cleanPhone = form.customer_phone.trim()

    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('business_id', businessId)
      .eq('phone', cleanPhone)
      .single()

    if (existing) {
      customerId = existing.id
    } else {
      const { data: newCustomer } = await supabase
        .from('customers')
        .insert({
          business_id: businessId,
          name: form.customer_name,
          phone: cleanPhone || null,
        })
        .select('id')
        .single()

      customerId = newCustomer?.id || null
    }

    if (!customerId) {
      setSaving(false)
      return
    }

    const selectedService = services.find(s => s.id === form.service_id)

    const { error } = await supabase
      .from('appointments')
      .insert({
        business_id: businessId,
        barber_id: form.barber_id,
        customer_id: customerId,
        service_id: form.service_id,
        scheduled_at: form.scheduled_at,
        duration_minutes: selectedService?.duration_minutes || 30,
        status: 'confirmed',
        source: 'manual',
        notes: form.notes || null,
      })

    if (error) {
      console.error('Error al crear registro:', error.message)
      setSaving(false)
      return
    }

    const createdDate = form.scheduled_at.slice(0, 10)

    setFilters(prev => ({
      ...prev,
      from: prev.from || createdDate,
      to: prev.to < createdDate ? createdDate : prev.to,
    }))

    setForm({
      customer_name: '',
      customer_phone: '',
      barber_id: '',
      service_id: '',
      scheduled_at: '',
      notes: '',
    })

    setShowModal(false)
    setSaving(false)
    loadData(businessId, filters)
  }

  async function updateStatus(id: string, status: string) {
    const supabase = createClient()
    await supabase.from('appointments').update({ status }).eq('id', id)
    loadData(businessId, filters)
  }

  function resetFilters() {
    const nextFilters = {
      from: formatDateInput(new Date(new Date().setDate(new Date().getDate() - 7))),
      to: formatDateInput(),
      status: '',
      source: '',
      barber_id: '',
      search: '',
    }
    setFilters(nextFilters)
    if (businessId) loadData(businessId, nextFilters)
  }

  const filteredRecords = useMemo(() => {
    const searchTerm = filters.search.trim().toLowerCase()

    return records.filter(record => {
      if (!searchTerm) return true

      const customerName = ((record.customer as any)?.name || '').toLowerCase()
      const customerPhone = ((record.customer as any)?.phone || '').toLowerCase()
      const barberName = ((record.barber as any)?.name || '').toLowerCase()
      const serviceName = ((record.service as any)?.name || '').toLowerCase()
      const notes = (record.notes || '').toLowerCase()

      return (
        customerName.includes(searchTerm) ||
        customerPhone.includes(searchTerm) ||
        barberName.includes(searchTerm) ||
        serviceName.includes(searchTerm) ||
        notes.includes(searchTerm)
      )
    })
  }, [records, filters.search])

  const metrics = useMemo(() => {
    const revenue = filteredRecords
      .filter(record => record.status === 'completed')
      .reduce((acc, record) => acc + Number((record.service as any)?.price || 0), 0)

    const uniqueCustomers = new Set(
      filteredRecords.map(record => record.customer_id).filter(Boolean)
    ).size

    return {
      total: filteredRecords.length,
      completed: filteredRecords.filter(r => r.status === 'completed').length,
      cancelled: filteredRecords.filter(r => r.status === 'cancelled').length,
      manual: filteredRecords.filter(r => r.source === 'manual').length,
      uniqueCustomers,
      revenue,
    }
  }, [filteredRecords])

  function exportToExcel() {
    try {
      setExporting(true)

      const summaryData = [
        { Campo: 'Fecha de exportación', Valor: format(new Date(), 'dd/MM/yyyy HH:mm') },
        { Campo: 'Desde', Valor: filters.from || 'No aplicado' },
        { Campo: 'Hasta', Valor: filters.to || 'No aplicado' },
        { Campo: 'Estado', Valor: filters.status || 'Todos' },
        { Campo: 'Canal', Valor: filters.source || 'Todos' },
        { Campo: 'Barbero', Valor: filters.barber_id ? (barbers.find(b => b.id === filters.barber_id)?.name || 'No encontrado') : 'Todos' },
        { Campo: 'Búsqueda', Valor: filters.search || 'Sin búsqueda' },
        { Campo: 'Total registros', Valor: metrics.total },
        { Campo: 'Completadas', Valor: metrics.completed },
        { Campo: 'Canceladas', Valor: metrics.cancelled },
        { Campo: 'Clientes únicos', Valor: metrics.uniqueCustomers },
        { Campo: 'Ingresos', Valor: Number(metrics.revenue.toFixed(2)) },
      ]

      const detailData = filteredRecords.map(record => ({
        Fecha: format(toZonedTime(new Date(record.scheduled_at), TZ), 'dd/MM/yyyy'),
        Hora: format(toZonedTime(new Date(record.scheduled_at), TZ), 'HH:mm'),
        Cliente: (record.customer as any)?.name || 'Sin nombre',
        Telefono: (record.customer as any)?.phone || 'Sin teléfono',
        Barbero: (record.barber as any)?.name || '-',
        Servicio: (record.service as any)?.name || '-',
        Precio: Number((record.service as any)?.price || 0),
        DuracionMinutos: (record.service as any)?.duration_minutes || record.duration_minutes || 0,
        Estado: statusConfig[record.status as keyof typeof statusConfig]?.label || record.status,
        Canal: sourceIcons[record.source as keyof typeof sourceIcons]?.label || record.source,
        Notas: record.notes || '',
      }))

      const workbook = XLSX.utils.book_new()

      const summarySheet = XLSX.utils.json_to_sheet(summaryData)
      const detailSheet = XLSX.utils.json_to_sheet(detailData)

      summarySheet['!cols'] = [
        { wch: 24 },
        { wch: 24 },
      ]

      detailSheet['!cols'] = [
        { wch: 14 },
        { wch: 10 },
        { wch: 24 },
        { wch: 18 },
        { wch: 20 },
        { wch: 22 },
        { wch: 12 },
        { wch: 16 },
        { wch: 14 },
        { wch: 14 },
        { wch: 35 },
      ]

      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen')
      XLSX.utils.book_append_sheet(workbook, detailSheet, 'Registros')

      const today = format(new Date(), 'yyyy-MM-dd')
      XLSX.writeFile(workbook, `registros-${today}.xlsx`)
    } catch (error) {
      console.error('Error al exportar Excel:', error)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-syne text-2xl font-bold text-white lg:text-3xl">Registros</h1>
          <p className="mt-1 text-sm text-gray-500">
            Historial general, control administrativo y registro manual de citas
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={exportToExcel}
            disabled={exporting || loading || filteredRecords.length === 0}
            className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-400 transition-all hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? 'Exportando...' : 'Exportar Excel'}
          </button>

          <button
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-orange-400"
          >
            <Plus className="h-4 w-4" />
            Nuevo registro
          </button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="rounded-xl bg-orange-500/10 p-2">
              <ClipboardList className="h-4 w-4 text-orange-400" />
            </div>
            <span className="text-[11px] uppercase tracking-wider text-gray-500">Total</span>
          </div>
          <p className="text-2xl font-bold text-white">{metrics.total}</p>
          <p className="mt-1 text-xs text-gray-500">Registros encontrados</p>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="rounded-xl bg-emerald-500/10 p-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </div>
            <span className="text-[11px] uppercase tracking-wider text-gray-500">Completadas</span>
          </div>
          <p className="text-2xl font-bold text-white">{metrics.completed}</p>
          <p className="mt-1 text-xs text-gray-500">Citas finalizadas</p>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="rounded-xl bg-red-500/10 p-2">
              <XCircle className="h-4 w-4 text-red-400" />
            </div>
            <span className="text-[11px] uppercase tracking-wider text-gray-500">Canceladas</span>
          </div>
          <p className="text-2xl font-bold text-white">{metrics.cancelled}</p>
          <p className="mt-1 text-xs text-gray-500">Registros cancelados</p>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="rounded-xl bg-blue-500/10 p-2">
              <Users className="h-4 w-4 text-blue-400" />
            </div>
            <span className="text-[11px] uppercase tracking-wider text-gray-500">Clientes</span>
          </div>
          <p className="text-2xl font-bold text-white">{metrics.uniqueCustomers}</p>
          <p className="mt-1 text-xs text-gray-500">Clientes únicos</p>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="rounded-xl bg-yellow-500/10 p-2">
              <DollarSign className="h-4 w-4 text-yellow-400" />
            </div>
            <span className="text-[11px] uppercase tracking-wider text-gray-500">Ingresos</span>
          </div>
          <p className="text-2xl font-bold text-white">{formatMoney(metrics.revenue)}</p>
          <p className="mt-1 text-xs text-gray-500">Solo completadas</p>
        </div>
      </div>

      <div className="glass mb-6 rounded-2xl p-4">
        <div className="mb-4 flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-orange-400" />
          <h2 className="text-sm font-semibold text-white">Filtros de registros</h2>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 xl:col-span-2">
            <Search className="h-4 w-4 text-gray-500" />
            <input
              value={filters.search}
              onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
              placeholder="Buscar cliente, teléfono, barbero..."
              className="w-full bg-transparent text-sm text-white outline-none placeholder-gray-600"
            />
          </div>

          <input
            type="date"
            value={filters.from}
            onChange={e => setFilters(prev => ({ ...prev, from: e.target.value }))}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-orange-500/50"
          />

          <input
            type="date"
            value={filters.to}
            onChange={e => setFilters(prev => ({ ...prev, to: e.target.value }))}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-orange-500/50"
          />

          <div className="relative">
            <select
              value={filters.status}
              onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="w-full appearance-none rounded-2xl border border-white/10 bg-[#111114] px-4 py-3 pr-10 text-sm text-white outline-none transition-all duration-200 hover:border-orange-400/30 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
            >
              <option value="">Todos los estados</option>
              <option value="confirmed">Confirmadas</option>
              <option value="pending">Pendientes</option>
              <option value="completed">Completadas</option>
              <option value="cancelled">Canceladas</option>
            </select>
            <svg
              className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          <div className="relative">
            <select
              value={filters.source}
              onChange={e => setFilters(prev => ({ ...prev, source: e.target.value }))}
              className="w-full appearance-none rounded-2xl border border-white/10 bg-[#111114] px-4 py-3 pr-10 text-sm text-white outline-none transition-all duration-200 hover:border-orange-400/30 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
            >
              <option value="">Todos los canales</option>
              <option value="manual">Manual</option>
              <option value="voice">Voz IA</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="web">Web</option>
            </select>
            <svg
              className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          <div className="relative">
            <select
              value={filters.barber_id}
              onChange={e => setFilters(prev => ({ ...prev, barber_id: e.target.value }))}
              className="w-full appearance-none rounded-2xl border border-white/10 bg-[#111114] px-4 py-3 pr-10 text-sm text-white outline-none transition-all duration-200 hover:border-orange-400/30 focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10"
            >
              <option value="">Todos los barberos</option>
              {barbers.map(barber => (
                <option key={barber.id} value={barber.id}>
                  {barber.name}
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => businessId && loadData(businessId, filters)}
            className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-orange-400"
          >
            Aplicar filtros
          </button>

          <button
            onClick={resetFilters}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <RotateCcw className="h-4 w-4" />
            Limpiar filtros
          </button>
        </div>
      </div>

      <div className="glass overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">Fecha y hora</th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">Cliente</th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">Barbero</th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">Servicio</th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">Precio</th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">Canal</th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">Estado</th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">Notas</th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500">Acciones</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                    Cargando registros...
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                    No hay registros para este filtro
                  </td>
                </tr>
              ) : (
                filteredRecords.map(record => {
                  const src = sourceIcons[record.source as keyof typeof sourceIcons] || sourceIcons.manual
                  const SrcIcon = src.icon
                  const status = statusConfig[record.status as keyof typeof statusConfig] || statusConfig.pending
                  const price = Number((record.service as any)?.price || 0)

                  return (
                    <tr key={record.id} className="transition-colors hover:bg-white/[0.02]">
                      <td className="px-6 py-4">
                        <p className="font-syne text-sm font-bold text-white">
                          {formatDateTime(record.scheduled_at)}
                        </p>
                      </td>

                      <td className="px-6 py-4">
                        <p className="text-sm text-white">{(record.customer as any)?.name || 'Sin nombre'}</p>
                        <p className="text-xs text-gray-500">{(record.customer as any)?.phone || 'Sin teléfono'}</p>
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-300">
                        {(record.barber as any)?.name || '-'}
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-300">
                        {(record.service as any)?.name || '-'}
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-300">
                        {formatMoney(price)}
                      </td>

                      <td className="px-6 py-4">
                        <div className={`flex items-center gap-1.5 text-xs ${src.color}`}>
                          <SrcIcon className="h-3.5 w-3.5" />
                          <span>{src.label}</span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.class}`}>
                          {status.label}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <p className="max-w-[220px] truncate text-xs text-gray-400">
                          {record.notes || '—'}
                        </p>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          {record.status !== 'completed' && record.status !== 'cancelled' && (
                            <>
                              <button
                                onClick={() => updateStatus(record.id, 'completed')}
                                className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-emerald-500/10 hover:text-emerald-400"
                                title="Completar"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </button>

                              <button
                                onClick={() => updateStatus(record.id, 'cancelled')}
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
            <h3 className="mb-5 text-lg font-bold text-white">Nuevo registro manual</h3>

            <div className="space-y-3">
              {[
                { label: 'Nombre del cliente', key: 'customer_name', type: 'text', placeholder: 'Roberto Herrera' },
                { label: 'Teléfono', key: 'customer_phone', type: 'tel', placeholder: '+504 9999-0000' },
                { label: 'Fecha y hora', key: 'scheduled_at', type: 'datetime-local', placeholder: '' },
                { label: 'Notas', key: 'notes', type: 'text', placeholder: 'Opcional...' },
              ].map(field => (
                <div key={field.key}>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-gray-400">
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    value={(form as any)[field.key]}
                    onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none placeholder-gray-600 focus:border-orange-500/50"
                  />
                </div>
              ))}

              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-gray-400">
                  Barbero
                </label>
                <div className="relative">
                  <select
                    value={form.barber_id}
                    onChange={e => setForm(prev => ({ ...prev, barber_id: e.target.value }))}
                    className="w-full appearance-none rounded-xl border border-white/10 bg-[#111114] px-4 py-2.5 pr-10 text-sm text-white outline-none"
                  >
                    <option value="">Seleccionar barbero</option>
                    {barbers.map(barber => (
                      <option key={barber.id} value={barber.id}>
                        {barber.name}
                      </option>
                    ))}
                  </select>

                  <svg
                    className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-gray-400">
                  Servicio
                </label>
                <div className="relative">
                  <select
                    value={form.service_id}
                    onChange={e => setForm(prev => ({ ...prev, service_id: e.target.value }))}
                    className="w-full appearance-none rounded-xl border border-white/10 bg-[#111114] px-4 py-2.5 pr-10 text-sm text-white outline-none"
                  >
                    <option value="">Seleccionar servicio</option>
                    {services.map(service => (
                      <option key={service.id} value={service.id}>
                        {service.name} — L.{service.price}
                      </option>
                    ))}
                  </select>

                  <svg
                    className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
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
                onClick={handleNewRecord}
                disabled={
                  saving ||
                  !form.customer_name ||
                  !form.barber_id ||
                  !form.service_id ||
                  !form.scheduled_at
                }
                className="flex-1 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-orange-400 disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar registro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}