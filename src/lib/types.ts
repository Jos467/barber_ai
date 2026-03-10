export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled'
export type AppointmentSource = 'manual' | 'whatsapp' | 'voice' | 'web'

export interface Business {
  id: string
  name: string
  phone: string | null
  address: string | null
  owner_id: string
  created_at: string
}

export interface Barber {
  id: string
  business_id: string
  name: string
  email: string | null
  phone: string | null
  active: boolean
  created_at: string
}

export interface Service {
  id: string
  business_id: string
  name: string
  duration_minutes: number
  price: number
  active: boolean
}

export interface Customer {
  id: string
  business_id: string
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  created_at: string
}

export interface Appointment {
  id: string
  business_id: string
  barber_id: string
  customer_id: string
  service_id: string
  scheduled_at: string
  duration_minutes: number
  status: AppointmentStatus
  source: AppointmentSource
  notes: string | null
  google_event_id: string | null
  created_at: string
  barber?: Barber
  customer?: Customer
  service?: Service
}