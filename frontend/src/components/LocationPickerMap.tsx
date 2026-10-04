import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Loader2 } from 'lucide-react';

export interface LocationDetails {
  locationName: string;
  county?: string;
  voivodeship?: string;
}

interface LocationPickerMapProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number, details?: LocationDetails) => void;
  height?: string;
  defaultCenter?: [number, number];
}

const DEFAULT_COORDS: [number, number] = [50.4380, 16.6548]; // Kłodzko

// Custom picker icon with glowing red pulse
const pickerIcon = L.divIcon({
  html: `
    <div class="relative flex items-center justify-center" style="width: 40px; height: 40px;">
      <span class="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-red-500 opacity-60"></span>
      <div class="relative flex items-center justify-center rounded-full shadow-2xl bg-red-600 border-2 border-white text-white font-bold" style="width: 32px; height: 32px; box-shadow: 0 0 20px rgba(239, 68, 68, 0.8);">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
    </div>
  `,
  className: 'custom-picker-pin',
  iconSize: [40, 40],
  iconAnchor: [20, 36],
});

// Funkcja pomocnicza do pobierania nazwy miejscowości z Nominatim OSM (Reverse Geocoding)
export const fetchReverseGeocode = async (
  latitude: number,
  longitude: number
): Promise<LocationDetails> => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=14&addressdetails=1`,
      {
        headers: {
          'Accept-Language': 'pl,en',
        },
      }
    );
    if (!res.ok) throw new Error('Błąd odpowiedzi API geolokalizacji');
    const data = await res.json();
    const addr = data.address || {};

    const placeName =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.suburb ||
      addr.county ||
      'Zlokalizowany punkt';

    let voivodeship = addr.state || '';
    if (voivodeship.toLowerCase().startsWith('województwo ')) {
      voivodeship = voivodeship.replace(/^województwo\s+/i, '');
    }

    return {
      locationName: placeName,
      county: addr.county || '',
      voivodeship: voivodeship,
    };
  } catch (err) {
    console.warn('Reverse geocoding error:', err);
    return {
      locationName: 'Wybrany punkt na mapie',
    };
  }
};

// Listener kliknięć na mapie
const MapClickHandler: React.FC<{
  onSelect: (lat: number, lng: number) => void;
}> = ({ onSelect }) => {
  useMapEvents({
    click(e) {
      onSelect(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
    },
  });
  return null;
};

// Automatyczne centrowanie widoku
const CenterController: React.FC<{
  center: [number, number];
}> = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center[0] && center[1]) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
};

export const LocationPickerMap: React.FC<LocationPickerMapProps> = ({
  lat,
  lng,
  onChange,
  height = '220px',
  defaultCenter = DEFAULT_COORDS,
}) => {
  const currentPos: [number, number] = lat && lng ? [lat, lng] : defaultCenter;
  const [resolvedName, setResolvedName] = useState<string>('');
  const [isResolving, setIsResolving] = useState(false);

  const handlePositionSelected = async (newLat: number, newLng: number) => {
    // Natychmiastowa aktualizacja współrzędnych
    onChange(newLat, newLng);
    setIsResolving(true);
    try {
      const details = await fetchReverseGeocode(newLat, newLng);
      setResolvedName(
        details.voivodeship
          ? `${details.locationName} (woj. ${details.voivodeship})`
          : details.locationName
      );
      onChange(newLat, newLng, details);
    } catch (err) {
      console.warn('Błąd geokodowania:', err);
    } finally {
      setIsResolving(false);
    }
  };

  const handleGetCurrentLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          handlePositionSelected(
            Number(position.coords.latitude.toFixed(6)),
            Number(position.coords.longitude.toFixed(6))
          );
        },
        (error) => {
          console.warn('Nie udało się pobrać lokalizacji GPS:', error.message);
        }
      );
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="relative w-full rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-900 shadow-inner group">
        <MapContainer
          center={currentPos}
          zoom={11}
          scrollWheelZoom={false}
          style={{ height, width: '100%' }}
          className="z-10 cursor-crosshair"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapClickHandler onSelect={handlePositionSelected} />
          {lat && lng && <CenterController center={[lat, lng]} />}

          {lat && lng && <Marker position={[lat, lng]} icon={pickerIcon} />}
        </MapContainer>

        {/* Przycisk GPS */}
        <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={handleGetCurrentLocation}
            title="Użyj mojej bieżącej lokalizacji GPS"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 text-xs font-semibold border border-slate-700 backdrop-blur-md shadow-lg transition active:scale-95"
          >
            <Navigation className="h-3.5 w-3.5 text-teal-400" />
            <span>Mój GPS</span>
          </button>
        </div>

        {/* Wskaźnik współrzędnych */}
        <div className="absolute bottom-2 left-2 z-20 rounded-lg bg-slate-900/90 px-2.5 py-1 text-[11px] font-medium text-slate-300 backdrop-blur-md border border-slate-700/60 pointer-events-none flex items-center gap-1.5">
          <MapPin className="h-3 w-3 text-red-400" />
          <span>
            {lat && lng ? `${lat}, ${lng}` : 'Kliknij na mapie, aby wybrać punkt'}
          </span>
        </div>
      </div>

      {/* Wykryta miejscowość i podział administracyjny */}
      {lat && lng && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-teal-500/30 text-xs text-teal-300 animate-fade-in">
          {isResolving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-400 shrink-0" />
              <span>Wykrywanie miejscowości i województwa z mapy...</span>
            </>
          ) : (
            <>
              <MapPin className="h-3.5 w-3.5 text-teal-400 shrink-0" />
              <span className="truncate">
                Wykryto z mapy: <strong>{resolvedName || 'Pomyślnie zlokalizowano'}</strong>
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default LocationPickerMap;
