import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function FacilityScreen({ session, onFacilityComplete }) {
  const [facilities, setFacilities] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [newName, setNewName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchFacilities()
  }, [])

  const fetchFacilities = async () => {
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('facilities')
      .select('id, name, created_at')
      .order('name')
    if (fetchError) {
      setError('Could not load facilities. Please try again.')
      console.error('Facility fetch error:', fetchError)
    } else {
      setFacilities(data || [])
    }
    setLoading(false)
  }

  const filtered = facilities.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleSelect = async (facility) => {
    setError(null)
    setSelecting(true)
    try {
      // Create the nurse row linked to this facility
      const { error: insertError } = await supabase.from('nurses').insert({
        id: session.user.id,
        facility_id: facility.id,
        role: 'nurse',
        email: session.user.email,
        name: session.user.user_metadata?.full_name || '',
      })
      if (insertError) throw insertError
      onFacilityComplete(facility)
    } catch (err) {
      // If the nurse row already exists (e.g. duplicate key), treat as success
      if (err.code === '23505') {
        onFacilityComplete(facility)
      } else {
        setError(err.message)
      }
    } finally {
      setSelecting(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return

    setError(null)
    setCreating(true)
    try {
      // Create the facility
      const { data: newFacility, error: createError } = await supabase
        .from('facilities')
        .insert({ name: trimmed })
        .select()
        .single()
      if (createError) throw createError

      // Create the nurse row linked to the new facility
      const { error: insertError } = await supabase.from('nurses').insert({
        id: session.user.id,
        facility_id: newFacility.id,
        role: 'nurse',
        email: session.user.email,
        name: session.user.user_metadata?.full_name || '',
      })
      if (insertError) throw insertError

      onFacilityComplete(newFacility)
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 px-6">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        {/* Logo */}
        <h1 className="font-display text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          <span className="text-blue-600">noa</span> health
        </h1>

        <p className="mt-4 text-lg text-gray-600 leading-relaxed">
          Select your facility to get started.
        </p>

        {/* Main card */}
        <div className="mt-8 w-full rounded-xl border border-gray-200 bg-white px-6 py-6 shadow-sm text-left">
          {!showCreate ? (
            <>
              {/* Search */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search facilities..."
                  className="block w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Facility list */}
              <div className="mt-4 max-h-64 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-500">
                    {search ? 'No facilities match your search.' : 'No facilities yet.'}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {filtered.map((facility) => (
                      <li key={facility.id}>
                        <button
                          onClick={() => handleSelect(facility)}
                          disabled={selecting}
                          className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-left transition-all duration-200 hover:border-blue-300 hover:bg-blue-50 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-900">{facility.name}</p>
                          </div>
                          <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {error && (
                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                  {error}
                </p>
              )}

              {/* Divider and create option */}
              <div className="mt-5 border-t border-gray-100 pt-4">
                <button
                  onClick={() => { setShowCreate(true); setError(null) }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-100 px-6 py-3 text-sm font-semibold text-gray-700 transition-all duration-200 hover:bg-gray-200 active:scale-[0.97]"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Create a new facility
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Create facility form */}
              <h2 className="font-display text-lg font-semibold text-gray-900">New facility</h2>
              <form onSubmit={handleCreate} className="mt-4 space-y-4">
                <div>
                  <label htmlFor="facilityName" className="block text-sm font-medium text-gray-700">Facility name</label>
                  <input
                    id="facilityName"
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    placeholder="e.g. Sunrise Care Home"
                    autoFocus
                  />
                </div>

                {error && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={creating}
                  className="w-full rounded-xl bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-md ring-4 ring-blue-600/10 transition-all duration-200 hover:bg-blue-700 hover:shadow-lg hover:ring-blue-700/20 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? 'Creating...' : 'Create & Continue'}
                </button>

                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setError(null); setNewName('') }}
                  className="w-full rounded-xl px-6 py-2.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-700"
                >
                  Back to facility list
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="mt-12 text-xs text-gray-400">
          Synthetic data only &mdash; no real patient information
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Built by Noa Health
        </p>
      </div>
    </div>
  )
}
