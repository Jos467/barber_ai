'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UserCog, Plus, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react'
import type { Barber } from '@/lib/types'

async function getBusinessId(supabase: any, userId: string): Promise<string | null> {
  const { data: ownedBiz } = await supabase
    .from('businesses').select('id').eq('owner_id', userId).single()
  if (ownedBiz) return ownedBiz.id

  const { data: memberBiz } = await supabase
    .from('business_members').select('business_id').eq('user_id', userId).single()
  return memberBiz?.business_id || null
}

export default function BarbersPage() {
  const [barbers, setBarbers]       = useState<Barber[]>([])
  const [businessId, setBusinessId] = useState('')
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '' })

  async function load(bizId: string) {
    const supabase = createClient()
    const { data } = await supabase
      .from('barbers').select('*').eq('business_id', bizId).order('name')
    if (data) setBarbers(data)
    setLoading(false)
  }

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const bizId = await getBusinessId(supabase, data.user.id)
      if (!bizId) return
      setBusinessId(bizId)
      load(bizId)
    })
  }, [])

  async function addBarber() {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('barbers').insert({ ...form, business_id: businessId })
    setForm({ name: '', email: '', phone: '' })
    setShowForm(false)
    setSaving(false)
    load(businessId)
  }

  async function toggleActive(id: string, current: boolean) {
    const supabase = createClient()
    await supabase.from('barbers').update({ active: !current }).eq('id', id)
    load(businessId)
  }

  async function deleteBarber(id: string, name: string) {
    if (!confirm(`¿Eliminar a ${name}? Esta acción no se puede deshacer.`)) return
    const supabase = createClient()
    await supabase.from('barbers').delete().eq('id', id)
    setBarbers(prev => prev.filter(b => b.id !== id))
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-syne text-2xl lg:text-3xl font-bold text-white">Barberos</h1>
          <p className="text-gray-500 text-sm mt-1">{barbers.filter(b => b.active).length} activos</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all">
          <Plus className="w-4 h-4" /> Agregar
        </button>
      </div>

      {showForm && (
        <div className="glass rounded-2xl p-5 mb-6 animate-fade-up">
          <h3 className="font-syne font-semibold text-white mb-4">Nuevo barbero</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { label: 'Nombre',   key: 'name',  placeholder: 'Carlos Méndez'    },
              { label: 'Email',    key: 'email', placeholder: 'carlos@email.com' },
              { label: 'Teléfono', key: 'phone', placeholder: '+504 9999-0000'   },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">{f.label}</label>
                <input value={(form as any)[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-orange-500/50 placeholder-gray-600" />
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl border border-white/10 text-gray-400 text-sm hover:text-white transition-colors">
              Cancelar
            </button>
            <button onClick={addBarber} disabled={saving || !form.name}
              className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-2 text-sm transition-all">
              {saving ? 'Guardando...' : 'Agregar barbero'}
            </button>
          </div>
        </div>
      )}

      <div className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Cargando...</div>
        ) : barbers.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <UserCog className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No hay barberos registrados</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {barbers.map(b => (
              <div key={b.id} className="flex items-center gap-4 px-6 py-4 hover:bg-white/2 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-400 font-bold">
                  {b.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium">{b.name}</p>
                  <p className="text-gray-500 text-xs">{b.email || b.phone || 'Sin contacto'}</p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full ${b.active ? 'badge-completed' : 'badge-cancelled'}`}>
                  {b.active ? 'Activo' : 'Inactivo'}
                </span>
                {/* Toggle activo/inactivo */}
                <button onClick={() => toggleActive(b.id, b.active)}
                  className="text-gray-500 hover:text-orange-400 transition-colors"
                  title={b.active ? 'Desactivar' : 'Activar'}>
                  {b.active
                    ? <ToggleRight className="w-6 h-6 text-emerald-400" />
                    : <ToggleLeft className="w-6 h-6" />
                  }
                </button>
                {/* Botón eliminar */}
                <button
                  onClick={() => deleteBarber(b.id, b.name)}
                  className="text-gray-600 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-500/10"
                  title="Eliminar barbero"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}