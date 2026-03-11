'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { Search, Users, Phone, Mail, Trash2 } from 'lucide-react'
import type { Customer, Appointment } from '@/lib/types'

async function getBusinessId(supabase: any, userId: string): Promise<string | null> {
  const { data: ownedBiz } = await supabase
    .from('businesses').select('id').eq('owner_id', userId).single()
  if (ownedBiz) return ownedBiz.id

  const { data: memberBiz } = await supabase
    .from('business_members').select('business_id').eq('user_id', userId).single()
  return memberBiz?.business_id || null
}

export default function CustomersPage() {
  const [customers, setCustomers]       = useState<Customer[]>([])
  const [businessId, setBusinessId]     = useState('')
  const [appointments, setAppointments] = useState<Record<string, Appointment[]>>({})
  const [search, setSearch]             = useState('')
  const [selected, setSelected]         = useState<Customer | null>(null)
  const [loading, setLoading]           = useState(true)

  async function loadCustomers(bizId: string) {
    const supabase = createClient()
    const { data: custs } = await supabase
      .from('customers').select('*').eq('business_id', bizId).order('name')
    if (custs) setCustomers(custs)
    setLoading(false)
  }

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const bizId = await getBusinessId(supabase, data.user.id)
      if (!bizId) return
      setBusinessId(bizId)
      loadCustomers(bizId)
    })
  }, [])

  async function loadHistory(customer: Customer) {
    setSelected(customer)
    if (appointments[customer.id]) return
    const supabase = createClient()
    const { data } = await supabase
      .from('appointments')
      .select('*, service:services(name,price), barber:barbers(name)')
      .eq('customer_id', customer.id)
      .order('scheduled_at', { ascending: false })
      .limit(10)
    if (data) setAppointments(p => ({ ...p, [customer.id]: data as unknown as Appointment[] }))
  }

  async function deleteCustomer(id: string, name: string) {
    if (!confirm(`¿Eliminar a ${name}?`)) return
    const supabase = createClient()
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) {
      alert(`Error al eliminar: ${error.message}`)
      return
    }
    // Solo actualizar UI si Supabase confirmó el delete
    if (selected?.id === id) setSelected(null)
    await loadCustomers(businessId)
  }

  const filtered = customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)
  )

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="font-syne text-2xl lg:text-3xl font-bold text-white">Clientes</h1>
        <p className="text-gray-500 text-sm mt-1">{customers.length} clientes registrados</p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
            <Search className="w-4 h-4 text-gray-500" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre o teléfono..."
              className="bg-transparent text-white text-sm outline-none w-full placeholder-gray-600" />
          </div>

          <div className="glass rounded-2xl overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-gray-500 text-sm">Cargando...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No se encontraron clientes</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {filtered.map(c => (
                  <div key={c.id} onClick={() => loadHistory(c)}
                    className={`w-full text-left px-5 py-4 hover:bg-white/5 transition-colors cursor-pointer ${selected?.id === c.id ? 'bg-orange-500/5 border-l-2 border-orange-500' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-400 font-bold text-sm flex-shrink-0">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-sm font-medium truncate">{c.name}</p>
                        <p className="text-gray-500 text-xs">{c.phone || c.email || 'Sin contacto'}</p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); deleteCustomer(c.id, c.name) }}
                        className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0 p-1 rounded-lg hover:bg-red-500/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          {selected ? (
            <div className="glass rounded-2xl p-6 animate-fade-up">
              <div className="flex items-center gap-4 mb-6 pb-6 border-b border-white/5">
                <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-400 font-bold text-xl">
                  {selected.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="font-syne font-bold text-white text-xl">{selected.name}</h2>
                  <div className="flex items-center gap-4 mt-1">
                    {selected.phone && (
                      <span className="flex items-center gap-1.5 text-gray-400 text-sm">
                        <Phone className="w-3.5 h-3.5" /> {selected.phone}
                      </span>
                    )}
                    {selected.email && (
                      <span className="flex items-center gap-1.5 text-gray-400 text-sm">
                        <Mail className="w-3.5 h-3.5" /> {selected.email}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <h3 className="font-syne font-semibold text-white mb-4">Historial de citas</h3>
              <div className="space-y-3">
                {(appointments[selected.id] || []).length === 0 ? (
                  <p className="text-gray-500 text-sm">Sin historial de citas</p>
                ) : (appointments[selected.id] || []).map(apt => (
                  <div key={apt.id} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                    <div>
                      <p className="text-white text-sm">{(apt.service as any)?.name}</p>
                      <p className="text-gray-500 text-xs mt-0.5">
                        {format(new Date(apt.scheduled_at), "d MMM yyyy, HH:mm")} · {(apt.barber as any)?.name}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-orange-400 text-sm font-medium">L.{(apt.service as any)?.price}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${
                        apt.status === 'completed' ? 'badge-completed' :
                        apt.status === 'cancelled' ? 'badge-cancelled' : 'badge-confirmed'
                      }`}>{apt.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="glass rounded-2xl p-12 text-center text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Selecciona un cliente para ver su historial</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}