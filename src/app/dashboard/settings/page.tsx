'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, Settings } from 'lucide-react'
import type { Service } from '@/lib/types'

async function getBusinessId(supabase: any, userId: string): Promise<{ id: string, name: string, phone: string, address: string } | null> {
  // Buscar como dueño
  const { data: ownedBiz } = await supabase
    .from('businesses').select('*').eq('owner_id', userId).single()
  if (ownedBiz) return ownedBiz

  // Buscar como miembro
  const { data: memberBiz } = await supabase
    .from('business_members').select('business_id').eq('user_id', userId).single()
  if (!memberBiz) return null

  const { data: biz } = await supabase
    .from('businesses').select('*').eq('id', memberBiz.business_id).single()
  return biz || null
}

export default function SettingsPage() {
  const [services, setServices]     = useState<Service[]>([])
  const [businessId, setBusinessId] = useState('')
  const [bizForm, setBizForm]       = useState({ name: '', phone: '', address: '' })
  const [svcForm, setSvcForm]       = useState({ name: '', duration_minutes: '30', price: '' })
  const [loading, setLoading]       = useState(true)
  const [savingBiz, setSavingBiz]   = useState(false)
  const [showSvcForm, setShowSvcForm] = useState(false)
  const [saved, setSaved]           = useState(false)

  async function loadServices(bizId: string) {
    const supabase = createClient()
    const { data } = await supabase
      .from('services').select('*').eq('business_id', bizId).order('name')
    if (data) setServices(data)
  }

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return

      // Buscar negocio como dueño O como miembro
      const biz = await getBusinessId(supabase, data.user.id)
      if (!biz) return

      setBusinessId(biz.id)
      setBizForm({ name: biz.name || '', phone: biz.phone || '', address: biz.address || '' })
      await loadServices(biz.id)
      setLoading(false)
    })
  }, [])

  async function saveBusiness() {
    setSavingBiz(true)
    const supabase = createClient()
    await supabase.from('businesses').update(bizForm).eq('id', businessId)
    setSavingBiz(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function addService() {
    const supabase = createClient()
    await supabase.from('services').insert({
      ...svcForm,
      duration_minutes: parseInt(svcForm.duration_minutes),
      price: parseFloat(svcForm.price),
      business_id: businessId,
    })
    setSvcForm({ name: '', duration_minutes: '30', price: '' })
    setShowSvcForm(false)
    loadServices(businessId)
  }

  async function deleteService(id: string) {
    const supabase = createClient()
    await supabase.from('services').update({ active: false }).eq('id', id)
    loadServices(businessId)
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="font-syne text-2xl lg:text-3xl font-bold text-white">Configuración</h1>
        <p className="text-gray-500 text-sm mt-1">Datos del negocio y servicios</p>
      </div>

      {/* Datos del negocio */}
      <div className="glass rounded-2xl p-6 mb-6">
        <h2 className="font-syne font-semibold text-white mb-5 flex items-center gap-2">
          <Settings className="w-5 h-5 text-orange-400" /> Datos del negocio
        </h2>
        <div className="space-y-4">
          {[
            { label: 'Nombre del negocio', key: 'name',    placeholder: 'Barbería El Estilo'       },
            { label: 'Teléfono',           key: 'phone',   placeholder: '+504 9999-0000'            },
            { label: 'Dirección',          key: 'address', placeholder: 'Col. Palmira, Tegucigalpa' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">{f.label}</label>
              <input value={(bizForm as any)[f.key]}
                onChange={e => setBizForm(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-orange-500/50 placeholder-gray-600" />
            </div>
          ))}
        </div>
        <button onClick={saveBusiness} disabled={savingBiz}
          className="mt-5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-all">
          {saved ? '✓ Guardado' : savingBiz ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      {/* Servicios */}
      <div className="glass rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-syne font-semibold text-white">Servicios</h2>
          <button onClick={() => setShowSvcForm(!showSvcForm)}
            className="flex items-center gap-1.5 text-sm text-orange-400 hover:text-orange-300 transition-colors">
            <Plus className="w-4 h-4" /> Agregar
          </button>
        </div>

        {showSvcForm && (
          <div className="bg-white/3 rounded-xl p-4 mb-5 border border-white/8 animate-fade-up">
            <div className="grid sm:grid-cols-3 gap-3 mb-3">
              <div className="sm:col-span-1">
                <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Nombre</label>
                <input value={svcForm.name} onChange={e => setSvcForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Corte clásico"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-orange-500/50 placeholder-gray-600" />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Duración (min)</label>
                <input type="number" value={svcForm.duration_minutes}
                  onChange={e => setSvcForm(p => ({ ...p, duration_minutes: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-orange-500/50" />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Precio (L.)</label>
                <input type="number" value={svcForm.price}
                  onChange={e => setSvcForm(p => ({ ...p, price: e.target.value }))}
                  placeholder="150"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-orange-500/50 placeholder-gray-600" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowSvcForm(false)} className="px-3 py-2 rounded-xl border border-white/10 text-gray-400 text-xs hover:text-white transition-colors">Cancelar</button>
              <button onClick={addService} disabled={!svcForm.name || !svcForm.price}
                className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-2 text-xs transition-all">
                Agregar servicio
              </button>
            </div>
          </div>
        )}

        <div className="divide-y divide-white/5">
          {services.filter(s => s.active).map(s => (
            <div key={s.id} className="flex items-center gap-4 py-4">
              <div className="flex-1">
                <p className="text-white font-medium text-sm">{s.name}</p>
                <p className="text-gray-500 text-xs mt-0.5">{s.duration_minutes} minutos</p>
              </div>
              <span className="text-orange-400 font-syne font-bold">L.{s.price}</span>
              <button onClick={() => deleteService(s.id)} className="text-gray-600 hover:text-red-400 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {services.filter(s => s.active).length === 0 && (
            <p className="py-6 text-center text-gray-500 text-sm">No hay servicios activos</p>
          )}
        </div>
      </div>

      {/* Info de API */}
      <div className="glass rounded-2xl p-6 border border-orange-500/20">
        <h2 className="font-syne font-semibold text-orange-400 mb-3">🔑 Información de API</h2>
        <p className="text-gray-400 text-sm mb-3">Usa estos datos para configurar n8n y Vapi en los Días 2 y 3:</p>
        <div className="bg-black/30 rounded-xl p-4 font-mono text-xs space-y-2">
          <p className="text-gray-400">
            Base URL: <span className="text-green-400">
              {typeof window !== 'undefined' ? window.location.origin : 'https://tu-proyecto.vercel.app'}
            </span>
          </p>
          <p className="text-gray-400">API Key: <span className="text-orange-400">barberai_secret_2026</span></p>
          <p className="text-gray-400">Header: <span className="text-blue-400">x-api-key</span></p>
        </div>
      </div>
    </div>
  )
}