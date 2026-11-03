export type WeatherCondition =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "showers"
  | "thunderstorm";

export interface WeatherSnapshot {
  city: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  precipitationChance: number | null;
  high: number;
  low: number;
  description: string;
  condition: WeatherCondition;
  isDay: boolean;
  updatedAt: string;
}

type GeocodingPlace = {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
};

type GeocodingResponse = {
  results?: GeocodingPlace[];
};

export interface WeatherLocationSuggestion {
  id: string;
  name: string;
  region: string;
  country: string;
  label: string;
  detail: string;
}

type ForecastResponse = {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    is_day: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max?: number[];
  };
};

function describeWeather(code: number): {
  description: string;
  condition: WeatherCondition;
} {
  if (code === 0) return { description: "Clear sky", condition: "clear" };
  if (code === 1) return { description: "Mainly clear", condition: "clear" };
  if (code === 2) return { description: "Partly cloudy", condition: "partly-cloudy" };
  if (code === 3) return { description: "Overcast", condition: "cloudy" };
  if (code === 45 || code === 48) return { description: "Foggy", condition: "fog" };
  if ([51, 53, 55, 56, 57].includes(code)) {
    return { description: "Light drizzle", condition: "drizzle" };
  }
  if ([61, 63, 65, 66, 67].includes(code)) {
    return { description: "Rain", condition: "rain" };
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return { description: "Snow", condition: "snow" };
  }
  if ([80, 81, 82].includes(code)) {
    return { description: "Rain showers", condition: "showers" };
  }
  if ([95, 96, 99].includes(code)) {
    return { description: "Thunderstorm", condition: "thunderstorm" };
  }
  return { description: "Variable conditions", condition: "cloudy" };
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Weather service returned ${response.status}.`);
  }
  return (await response.json()) as T;
}


export async function searchWeatherLocations(
  query: string,
  signal?: AbortSignal,
): Promise<WeatherLocationSuggestion[]> {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) return [];

  const geocodingUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geocodingUrl.search = new URLSearchParams({
    name: cleanQuery,
    count: "8",
    language: "en",
    format: "json",
  }).toString();

  const geocoding = await fetchJson<GeocodingResponse>(geocodingUrl.toString(), signal);
  const seen = new Set<string>();

  return (geocoding.results ?? []).flatMap((place) => {
    const id = `${place.latitude.toFixed(3)}:${place.longitude.toFixed(3)}`;
    if (seen.has(id)) return [];
    seen.add(id);

    const region = place.admin1 ?? "";
    const country = place.country ?? "";
    const parts = [place.name, region, country].filter(
      (part, index, all): part is string => Boolean(part) && all.indexOf(part) === index,
    );

    return [{
      id,
      name: place.name,
      region,
      country,
      label: parts.join(", "),
      detail: [region, country].filter(Boolean).join(", "),
    }];
  });
}

export async function getWeatherForCity(query: string): Promise<WeatherSnapshot> {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) {
    throw new Error("Enter at least two characters for a city name.");
  }

  const geocodingUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geocodingUrl.search = new URLSearchParams({
    name: cleanQuery,
    count: "1",
    language: "en",
    format: "json",
  }).toString();

  const geocoding = await fetchJson<GeocodingResponse>(geocodingUrl.toString());
  const place = geocoding.results?.[0];
  if (!place) {
    throw new Error(`No location found for “${cleanQuery}”. Try a nearby city name.`);
  }

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.search = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current:
      "temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    forecast_days: "1",
    timezone: "auto",
  }).toString();

  const forecast = await fetchJson<ForecastResponse>(forecastUrl.toString());
  const weatherText = describeWeather(forecast.current.weather_code);
  const placeLabel = [place.name, place.admin1, place.country]
    .filter((part, index, all): part is string => Boolean(part) && all.indexOf(part) === index)
    .slice(0, 2)
    .join(", ");

  return {
    city: placeLabel,
    temperature: Math.round(forecast.current.temperature_2m),
    feelsLike: Math.round(forecast.current.apparent_temperature),
    humidity: Math.round(forecast.current.relative_humidity_2m),
    windSpeed: Math.round(forecast.current.wind_speed_10m),
    precipitationChance: forecast.daily.precipitation_probability_max?.[0] ?? null,
    high: Math.round(forecast.daily.temperature_2m_max[0] ?? forecast.current.temperature_2m),
    low: Math.round(forecast.daily.temperature_2m_min[0] ?? forecast.current.temperature_2m),
    description: weatherText.description,
    condition: weatherText.condition,
    isDay: forecast.current.is_day === 1,
    updatedAt: forecast.current.time,
  };
}
