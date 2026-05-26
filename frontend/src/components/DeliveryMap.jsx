import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet default icon issue with bundlers
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const driverIcon = new L.DivIcon({
  className: 'custom-driver-icon',
  html: `<div style="background:#059669;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 17H3v-3h1l2-3h7l2 3h1v3h-2"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/>
    </svg>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
})

const pharmacyIcon = new L.DivIcon({
  className: 'custom-pharmacy-icon',
  html: `<div style="background:#2563eb;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 9h18v10a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path d="M3 9l2.45-4.9A2 2 0 017.24 3h9.52a2 2 0 011.8 1.1L21 9"/>
    </svg>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

const destinationIcon = new L.DivIcon({
  className: 'custom-dest-icon',
  html: `<div style="background:#ef4444;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
})

function FitBounds({ positions }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length >= 2) {
      const bounds = L.latLngBounds(positions)
      map.fitBounds(bounds, { padding: [50, 50] })
    } else if (positions.length === 1) {
      map.setView(positions[0], 15)
    }
  }, [positions, map])
  return null
}

function AnimateDriver({ position }) {
  const map = useMap()
  const prevPos = useRef(position)
  useEffect(() => {
    if (position && (position[0] !== prevPos.current[0] || position[1] !== prevPos.current[1])) {
      map.panTo(position, { animate: true, duration: 1 })
      prevPos.current = position
    }
  }, [position, map])
  return null
}

export default function DeliveryMap({
  driverLocation,
  pharmacyLocation,
  destinationLocation,
  pharmacyName,
  destinationAddress,
  status,
  className = '',
}) {
  const center = driverLocation || destinationLocation || pharmacyLocation || [-16.6869, -49.2648]
  
  const allPositions = [
    pharmacyLocation,
    driverLocation,
    destinationLocation,
  ].filter(Boolean)

  const routeLine = []
  if (pharmacyLocation) routeLine.push(pharmacyLocation)
  if (driverLocation) routeLine.push(driverLocation)
  if (destinationLocation) routeLine.push(destinationLocation)

  return (
    <div className={`rounded-xl overflow-hidden border border-gray-200 shadow-sm ${className}`}>
      <MapContainer
        center={center}
        zoom={14}
        scrollWheelZoom={true}
        style={{ height: '100%', minHeight: '300px', width: '100%' }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds positions={allPositions} />

        {driverLocation && (
          <>
            <AnimateDriver position={driverLocation} />
            <Marker position={driverLocation} icon={driverIcon}>
              <Popup>
                <strong>Entregador</strong>
                <br />
                {status === 'a_caminho' ? 'A caminho da entrega' : 'Coletando pedido'}
              </Popup>
            </Marker>
          </>
        )}

        {pharmacyLocation && (
          <Marker position={pharmacyLocation} icon={pharmacyIcon}>
            <Popup>
              <strong>{pharmacyName || 'Farmácia'}</strong>
              <br />
              Ponto de coleta
            </Popup>
          </Marker>
        )}

        {destinationLocation && (
          <Marker position={destinationLocation} icon={destinationIcon}>
            <Popup>
              <strong>Destino</strong>
              <br />
              {destinationAddress || 'Endereço de entrega'}
            </Popup>
          </Marker>
        )}

        {routeLine.length >= 2 && (
          <Polyline
            positions={routeLine}
            pathOptions={{
              color: '#059669',
              weight: 4,
              opacity: 0.7,
              dashArray: '10, 10',
            }}
          />
        )}
      </MapContainer>
    </div>
  )
}
