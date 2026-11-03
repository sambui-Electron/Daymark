import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  MapPin,
  Moon,
  Plus,
  Search,
  Settings2,
  Sun,
  Sunrise,
  Sunset,
  Trash2,
  X,
} from "lucide-react";
import { getWeatherForCity, searchWeatherLocations, type WeatherCondition, type WeatherLocationSuggestion, type WeatherSnapshot } from "./lib/weather";
import AdminConsole from "./components/AdminConsole";

type View = "today" | "calendar" | "tasks";
type AuthMode = "signin" | "create";
type Theme = "light" | "dark";

interface User {
  id: string;
  name: string;
  email: string;
  weatherLocation: string;
}

interface AuthResponse {
  token: string;
  user: User;
}

interface TaskListMeta {
  id: string;
  name: string;
  color: string;
}

interface Todo {
  id: string;
  title: string;
  details: string;
  dueDate: string;
  listId: string;
  listName: string;
  listColor: string;
  completed: boolean;
  createdAt: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

function formatDate(date: Date, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("en-US", options).format(date);
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function sortTodos(items: Todo[]): Todo[] {
  return [...items].sort((a, b) => {
    if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function conditionIcon(condition: WeatherCondition, isDay = true, size = 28) {
  const props = { size, strokeWidth: 1.6 };
  switch (condition) {
    case "clear":
      return isDay ? <Sun {...props} /> : <Sunset {...props} />;
    case "partly-cloudy":
      return <CloudSun {...props} />;
    case "cloudy":
      return <Cloud {...props} />;
    case "fog":
      return <CloudFog {...props} />;
    case "drizzle":
      return <CloudDrizzle {...props} />;
    case "rain":
    case "showers":
      return <CloudRain {...props} />;
    case "snow":
      return <CloudSnow {...props} />;
    case "thunderstorm":
      return <CloudLightning {...props} />;
  }
}

function WeatherCard({
  user,
  token,
  weather,
  loading,
  error,
  onSaved,
}: {
  user: User;
  token: string;
  weather: WeatherSnapshot | null;
  loading: boolean;
  error: string;
  onSaved: (user: User) => void;
}) {
  const [editing, setEditing] = useState(!user.weatherLocation);
  const [city, setCity] = useState(user.weatherLocation);
  const [suggestions, setSuggestions] = useState<WeatherLocationSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    setCity(user.weatherLocation);
    setEditing(!user.weatherLocation);
    setSuggestions([]);
    setShowSuggestions(false);
  }, [user.weatherLocation]);

  useEffect(() => {
    const query = city.trim();
    if (!editing || !showSuggestions || query.length < 2) {
      setSuggestions([]);
      setSearching(false);
      setSearchError("");
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchWeatherLocations(query, controller.signal);
        if (!controller.signal.aborted) {
          setSuggestions(results);
          setSearchError("");
        }
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setSearchError("Could not search locations. Check your connection and try again.");
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 260);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [city, editing, showSuggestions]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (city.trim().length < 2) return;
    setSaving(true);
    setSaveError("");
    try {
      const updated = await invoke<User>("update_weather_location", {
        token,
        location: city.trim(),
      });
      onSaved(updated);
      setEditing(false);
      setShowSuggestions(false);
    } catch (caught) {
      setSaveError(String(caught));
    } finally {
      setSaving(false);
    }
  }

  function chooseLocation(location: WeatherLocationSuggestion) {
    setCity(location.label);
    setShowSuggestions(false);
    setSuggestions([]);
    setSearchError("");
    setActiveSuggestionIndex(0);
    setSaveError("");
  }

  return (
    <section className="weather-card panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">LOCAL WEATHER</p>
          <h2>Conditions</h2>
        </div>
        <button
          className="icon-button subtle-button"
          type="button"
          aria-label="Change weather location"
          onClick={() => {
            setEditing((value) => !value);
            setShowSuggestions(false);
          }}
        >
          <Settings2 size={17} strokeWidth={1.7} />
        </button>
      </div>

      {editing ? (
        <form className="weather-location-form" onSubmit={(event) => void handleSave(event)}>
          <label htmlFor="weather-city">Search for a city</label>
          <div className="weather-search-wrap">
            <div className="input-with-icon">
              <Search size={16} />
              <input
                id="weather-city"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showSuggestions && city.trim().length >= 2}
                aria-haspopup="listbox"
                aria-controls="weather-city-options"
                aria-activedescendant={showSuggestions && suggestions.length > 0 ? `weather-option-${activeSuggestionIndex}` : undefined}
                value={city}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setShowSuggestions(false);
                  } else if (event.key === "ArrowDown" && suggestions.length > 0) {
                    event.preventDefault();
                    setActiveSuggestionIndex((index) => Math.min(index + 1, suggestions.length - 1));
                  } else if (event.key === "ArrowUp" && suggestions.length > 0) {
                    event.preventDefault();
                    setActiveSuggestionIndex((index) => Math.max(index - 1, 0));
                  } else if (event.key === "Enter" && showSuggestions && suggestions.length > 0) {
                    event.preventDefault();
                    chooseLocation(suggestions[activeSuggestionIndex]);
                  }
                }}
                onChange={(event) => {
                  setCity(event.target.value);
                  setShowSuggestions(true);
                  setSearching(true);
                  setActiveSuggestionIndex(0);
                  setSuggestions([]);
                  setSearchError("");
                }}
                placeholder="Search city or region"
                maxLength={100}
                autoComplete="off"
              />
            </div>
            {showSuggestions && city.trim().length >= 2 && (
              <div className="weather-suggestions" id="weather-city-options" role="listbox" aria-label="Matching locations">
                {searching ? (
                  <div className="weather-suggestion-message">Searching locations…</div>
                ) : suggestions.length > 0 ? (
                  suggestions.map((location, index) => (
                    <button
                      id={`weather-option-${index}`}
                      className="weather-suggestion"
                      type="button"
                      role="option"
                      aria-selected={activeSuggestionIndex === index}
                      key={location.id}
                      onMouseEnter={() => setActiveSuggestionIndex(index)}
                      onClick={() => chooseLocation(location)}
                    >
                      <MapPin size={14} />
                      <span><strong>{location.name}</strong><small>{location.detail || location.country}</small></span>
                    </button>
                  ))
                ) : (
                  <div className="weather-suggestion-message">{searchError || "No matching places found."}</div>
                )}
              </div>
            )}
          </div>
          <p className="weather-search-hint">Type a place name, then choose a result.</p>
          <button className="button button-dark button-full" type="submit" disabled={saving || city.trim().length < 2}>
            {saving ? "Saving…" : "Use this location"}
          </button>
          {saveError && <p className="inline-error">{saveError}</p>}
          {user.weatherLocation && (
            <button className="text-button centered" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          )}
        </form>
      ) : (
        <>
          {loading ? (
            <div className="weather-loading"><span className="loading-dot" /> Updating forecast…</div>
          ) : weather ? (
            <>
              <div className="weather-location">{weather.city}</div>
              <div className="weather-current">
                <div className="weather-icon">{conditionIcon(weather.condition, weather.isDay, 36)}</div>
                <div className="weather-temperature">
                  <span>{weather.temperature}°</span>
                  <small>{weather.description}</small>
                </div>
              </div>
              <p className="weather-feels">Feels like {weather.feelsLike}°</p>
              <div className="weather-range">
                <span><Sunrise size={14} /> H: {weather.high}°</span>
                <span><Sunset size={14} /> L: {weather.low}°</span>
              </div>
              <div className="weather-stats">
                <div><span>Humidity</span><strong>{weather.humidity}%</strong></div>
                <div><span>Wind</span><strong>{weather.windSpeed} km/h</strong></div>
                <div><span>Rain chance</span><strong>{weather.precipitationChance == null ? "—" : `${weather.precipitationChance}%`}</strong></div>
              </div>
              <div className="weather-attribution">
                Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>
              </div>
            </>
          ) : (
            <div className="weather-empty">
              <div className="weather-empty-icon"><CloudSun size={26} strokeWidth={1.5} /></div>
              <p>{error || "Choose a city to see the local forecast."}</p>
              <button className="text-button" type="button" onClick={() => setEditing(true)}>
                Set a location <ChevronRight size={14} />
              </button>
            </div>
          )}
          {error && weather && <p className="inline-error">{error}</p>}
        </>
      )}
    </section>
  );
}

function TaskRow({
  todo,
  onToggle,
  onDelete,
  showDate = false,
}: {
  todo: Todo;
  onToggle: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
  showDate?: boolean;
}) {
  const dueDate = dateFromKey(todo.dueDate);
  return (
    <div className={`task-row ${todo.completed ? "task-row-complete" : ""}`}>
      <button
        className={`task-check ${todo.completed ? "checked" : ""}`}
        type="button"
        aria-label={todo.completed ? `Mark ${todo.title} incomplete` : `Complete ${todo.title}`}
        onClick={() => onToggle(todo)}
      >
        {todo.completed && <Check size={14} strokeWidth={2.5} />}
      </button>
      <div className="task-copy">
        <p className="task-title">{todo.title}</p>
        {todo.details && <p className="task-details">{todo.details}</p>}
        <div className="task-meta">
          <span className="category-tag" style={{ color: todo.listColor, backgroundColor: `${todo.listColor}20` }}>{todo.listName}</span>
          {showDate && <span>{formatDate(dueDate, { month: "short", day: "numeric" })}</span>}
        </div>
      </div>
      <button
        className="icon-button task-delete"
        type="button"
        aria-label={`Delete ${todo.title}`}
        onClick={() => onDelete(todo)}
      >
        <Trash2 size={15} strokeWidth={1.7} />
      </button>
    </div>
  );
}

function TaskList({
  todos,
  onToggle,
  onDelete,
  showDate = false,
  emptyTitle = "Nothing on the list",
  emptyText = "A little breathing room in your day.",
}: {
  todos: Todo[];
  onToggle: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
  showDate?: boolean;
  emptyTitle?: string;
  emptyText?: string;
}) {
  if (todos.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-mark"><CheckCheck size={20} strokeWidth={1.5} /></div>
        <p className="empty-title">{emptyTitle}</p>
        <p className="empty-copy">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="task-list">
      {todos.map((todo) => (
        <TaskRow key={todo.id} todo={todo} onToggle={onToggle} onDelete={onDelete} showDate={showDate} />
      ))}
    </div>
  );
}

function TaskModal({
  initialDate,
  initialListId,
  lists,
  onClose,
  onCreate,
}: {
  initialDate: string;
  initialListId: string;
  lists: TaskListMeta[];
  onClose: () => void;
  onCreate: (values: { title: string; details: string; dueDate: string; listId: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [dueDate, setDueDate] = useState(initialDate);
  const [listId, setListId] = useState(initialListId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const initial = dateFromKey(initialDate);
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });

  const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const calendarOffset = (monthStart.getDay() + 6) % 7;
  const calendarStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1 - calendarOffset);
  const pickerDays = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(calendarStart);
    day.setDate(calendarStart.getDate() + index);
    return day;
  });
  const todayKey = dateKey(new Date());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Give your task a name first.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onCreate({ title: title.trim(), details: details.trim(), dueDate, listId });
    } catch (caught) {
      setError(String(caught));
      setSaving(false);
    }
  }

  function selectDate(key: string) {
    setDueDate(key);
    setDatePickerOpen(false);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="task-modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
        <div className="modal-topline">
          <p className="eyebrow">NEW REMINDER</p>
          <button className="icon-button subtle-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
        </div>
        <h2 id="task-modal-title">Add a task</h2>
        <p className="modal-subtitle">Keep it simple. You can add the details now or later.</p>
        <form onSubmit={(event) => void submit(event)}>
          <label className="field-label" htmlFor="task-title">Title</label>
          <input
            id="task-title"
            className="field-input title-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="What needs to get done?"
            maxLength={120}
            autoFocus
          />
          <label className="field-label" htmlFor="task-details">Notes <span>Optional</span></label>
          <textarea
            id="task-details"
            className="field-input field-textarea"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Add a little context…"
            maxLength={500}
            rows={3}
          />
          <div className="field-grid">
            <div>
              <label className="field-label" htmlFor="task-date-trigger">Due date</label>
              <button
                id="task-date-trigger"
                className="field-input date-picker-trigger"
                type="button"
                aria-expanded={datePickerOpen}
                aria-controls="task-date-picker"
                onClick={() => setDatePickerOpen((value) => !value)}
              >
                <span><CalendarDays size={15} />{formatDate(dateFromKey(dueDate), { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
                <ChevronDown size={15} />
              </button>
            </div>
            <div>
              <label className="field-label" htmlFor="task-list">List</label>
              <div className="select-wrap">
                <select id="task-list" className="field-input" value={listId} onChange={(event) => setListId(event.target.value)} required>
                  {lists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <ChevronDown size={15} />
              </div>
            </div>
          </div>
          {datePickerOpen && (
            <section className="task-date-picker" id="task-date-picker" aria-label="Choose a due date">
              <div className="task-date-picker-toolbar">
                <button className="icon-button" type="button" aria-label="Previous month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}><ChevronLeft size={17} /></button>
                <strong>{formatDate(calendarMonth, { month: "long", year: "numeric" })}</strong>
                <button className="icon-button" type="button" aria-label="Next month" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}><ChevronRight size={17} /></button>
              </div>
              <div className="task-date-grid">
                {WEEKDAYS.map((day) => <span className="task-date-weekday" key={day}>{day.slice(0, 1)}</span>)}
                {pickerDays.map((day) => {
                  const key = dateKey(day);
                  const inMonth = day.getMonth() === calendarMonth.getMonth();
                  return (
                    <button
                      key={key}
                      className={`task-date-day ${inMonth ? "" : "outside-month"} ${key === dueDate ? "selected" : ""} ${key === todayKey ? "is-today" : ""}`}
                      type="button"
                      onClick={() => selectDate(key)}
                      aria-label={formatDate(day, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                      aria-pressed={key === dueDate}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
              <div className="task-date-picker-footer">
                <button className="text-button" type="button" onClick={() => { const now = new Date(); setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1)); selectDate(todayKey); }}>Today</button>
                <button className="text-button" type="button" onClick={() => setDatePickerOpen(false)}>Done</button>
              </div>
            </section>
          )}
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button className="button button-light" type="button" onClick={onClose}>Cancel</button>
            <button className="button button-dark" type="submit" disabled={saving}>{saving ? "Saving…" : "Add task"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CalendarView({
  todos,
  selectedDate,
  setSelectedDate,
  month,
  setMonth,
  onAdd,
  onToggle,
  onDelete,
}: {
  todos: Todo[];
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  month: Date;
  setMonth: (date: Date) => void;
  onAdd: (date: string) => void;
  onToggle: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}) {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(month.getFullYear(), month.getMonth(), 1 - offset);
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
  const today = dateKey(new Date());
  const selectedTodos = todos.filter((todo) => todo.dueDate === selectedDate);
  const selected = dateFromKey(selectedDate);

  return (
    <div className="calendar-layout">
      <section className="panel calendar-panel">
        <div className="calendar-toolbar">
          <div>
            <p className="eyebrow">YOUR SCHEDULE</p>
            <h2>{formatDate(month, { month: "long", year: "numeric" })}</h2>
          </div>
          <div className="calendar-controls">
            <button className="icon-button" type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={18} /></button>
            <button className="button button-today" type="button" onClick={() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelectedDate(today); }}>Today</button>
            <button className="icon-button" type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={18} /></button>
          </div>
        </div>
        <div className="calendar-grid">
          {WEEKDAYS.map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}
          {days.map((date) => {
            const key = dateKey(date);
            const dayTodos = todos.filter((todo) => todo.dueDate === key);
            const hasOpen = dayTodos.some((todo) => !todo.completed);
            const isCurrentMonth = date.getMonth() === month.getMonth();
            return (
              <button
                key={key}
                className={`calendar-day ${!isCurrentMonth ? "outside-month" : ""} ${key === selectedDate ? "selected" : ""} ${key === today ? "is-today" : ""}`}
                type="button"
                onClick={() => setSelectedDate(key)}
                aria-label={`${formatDate(date, { month: "long", day: "numeric", year: "numeric" })}, ${dayTodos.length} tasks`}
              >
                <span className="calendar-day-number">{date.getDate()}</span>
                {dayTodos.length > 0 && (
                  <span className="calendar-day-indicators">
                    <i className={hasOpen ? "indicator-open" : "indicator-done"} />
                    {dayTodos.length > 1 && <i className="indicator-more" />}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="calendar-legend">
          <span><i className="legend-dot dot-open" /> Open tasks</span>
          <span><i className="legend-dot dot-done" /> Completed</span>
        </div>
      </section>
      <section className="panel selected-day-panel">
        <div className="selected-day-heading">
          <div>
            <p className="eyebrow">SELECTED DAY</p>
            <h2>{formatDate(selected, { weekday: "long", month: "long", day: "numeric" })}</h2>
          </div>
          <button className="icon-button subtle-button" type="button" onClick={() => onAdd(selectedDate)} aria-label="Add task for selected day"><Plus size={18} /></button>
        </div>
        <p className="selected-day-count">{selectedTodos.length} {selectedTodos.length === 1 ? "task" : "tasks"} scheduled</p>
        <TaskList
          todos={selectedTodos}
          onToggle={onToggle}
          onDelete={onDelete}
          emptyTitle="A clear day"
          emptyText="Nothing planned here yet. Add a task when you need one."
        />
        <button className="button button-light add-for-date" type="button" onClick={() => onAdd(selectedDate)}><Plus size={15} /> Add task for this day</button>
      </section>
    </div>
  );
}

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const nextTheme = theme === "dark" ? "light" : "dark";
  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
    >
      {theme === "dark" ? <Sun size={16} strokeWidth={1.8} /> : <Moon size={16} strokeWidth={1.8} />}
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}

function ListsManager({
  token,
  lists,
  onClose,
  onChanged,
}: {
  token: string;
  lists: TaskListMeta[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [drafts, setDrafts] = useState(lists.map((list) => ({ ...list })));
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#879a7c");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setDrafts(lists.map((list) => ({ ...list }))), [lists]);

  async function saveList(list: TaskListMeta) {
    setBusy(true);
    setError("");
    try {
      await invoke("update_task_list", { token, id: list.id, name: list.name, color: list.color });
      await onChanged();
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function removeList(list: TaskListMeta) {
    if (!window.confirm(`Delete “${list.name}”? Its tasks will be moved to another list.`)) return;
    setBusy(true);
    setError("");
    try {
      await invoke("delete_task_list", { token, id: list.id });
      await onChanged();
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function addList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await invoke("create_task_list", { token, name: newName, color: newColor });
      setNewName("");
      await onChanged();
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop list-manager-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="list-manager-modal" role="dialog" aria-modal="true" aria-labelledby="list-manager-title">
        <div className="modal-topline"><p className="eyebrow">YOUR WORKSPACE</p><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        <h2 id="list-manager-title">Manage lists</h2>
        <p className="modal-subtitle">Give each part of your day its own place. Tasks stay with your account.</p>
        <div className="managed-list-items">
          {drafts.map((list) => (
            <div className="managed-list-row" key={list.id}>
              <i style={{ backgroundColor: list.color }} />
              <input aria-label={`${list.name} list name`} value={list.name} maxLength={32} onChange={(event) => setDrafts((current) => current.map((item) => item.id === list.id ? { ...item, name: event.target.value } : item))} />
              <input className="list-color-picker" type="color" aria-label={`${list.name} list color`} value={list.color} onChange={(event) => setDrafts((current) => current.map((item) => item.id === list.id ? { ...item, color: event.target.value } : item))} />
              <button className="icon-button" type="button" title="Save list" aria-label={`Save ${list.name}`} onClick={() => void saveList(list)} disabled={busy}><Check size={15} /></button>
              <button className="icon-button list-remove-button" type="button" title="Delete list" aria-label={`Delete ${list.name}`} onClick={() => void removeList(list)} disabled={busy || lists.length <= 1}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <form className="add-list-form" onSubmit={(event) => void addList(event)}>
          <input className="field-input" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="New list name" maxLength={32} aria-label="New list name" required />
          <input className="list-color-picker" type="color" value={newColor} onChange={(event) => setNewColor(event.target.value)} aria-label="New list color" />
          <button className="button button-dark" type="submit" disabled={busy || !newName.trim()}><Plus size={14} /> Add list</button>
        </form>
        {error && <p className="form-error list-manager-error">{error}</p>}
        <div className="modal-actions"><button className="button button-light" type="button" onClick={onClose}>Done</button></div>
      </section>
    </div>
  );
}

function AuthScreen({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = mode === "create"
        ? await invoke<AuthResponse>("register_user", { name, email, password })
        : await invoke<AuthResponse>("login_user", { email, password });
      setAuth(response);
    } catch (caught) {
      setError(String(caught));
    } finally {
      setBusy(false);
    }
  }

  if (auth) return <Dashboard initialAuth={auth} theme={theme} onToggleTheme={onToggleTheme} />;
  if (showAdmin) return <AdminConsole theme={theme} onExit={() => setShowAdmin(false)} />;

  return (
    <main className="auth-screen min-h-screen antialiased">
      <section className="auth-intro">
        <div className="brand-lockup"><div className="brand-mark">d</div><span>daymark</span></div>
        <div className="auth-message">
          <p className="eyebrow">A LITTLE MORE CLARITY</p>
          <h1>Make room for<br /><span>what matters.</span></h1>
          <p className="auth-description">A quieter way to keep track of your tasks, your plans, and the day ahead.</p>
        </div>
        <div className="auth-footer"><span>Designed for everyday life.</span><span>DAYMARK · 01</span></div>
      </section>
      <section className="auth-side">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <div className="auth-card">
          <div className="auth-card-heading">
            <p className="eyebrow">YOUR PERSONAL SPACE</p>
            <h2>{mode === "signin" ? "Welcome back." : "Start fresh."}</h2>
            <p>{mode === "signin" ? "Sign in to pick up where you left off." : "Create an account to keep your days in order."}</p>
          </div>
          <div className="auth-switch" role="tablist" aria-label="Account options">
            <button type="button" className={mode === "signin" ? "active" : ""} onClick={() => { setMode("signin"); setError(""); }}>Sign in</button>
            <button type="button" className={mode === "create" ? "active" : ""} onClick={() => { setMode("create"); setError(""); }}>Create account</button>
          </div>
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            {mode === "create" && (
              <div className="field-group">
                <label className="field-label" htmlFor="account-name">Your name</label>
                <input id="account-name" className="field-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" maxLength={48} autoComplete="name" required />
              </div>
            )}
            <div className="field-group">
              <label className="field-label" htmlFor="account-email">Email address</label>
              <input id="account-email" className="field-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="account-password">Password</label>
              <input id="account-password" className="field-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "create" ? "At least 8 characters" : "Enter your password"} autoComplete={mode === "create" ? "new-password" : "current-password"} minLength={mode === "create" ? 8 : undefined} required />
            </div>
            {error && <p className="form-error auth-error">{error}</p>}
            <button className="button button-dark button-full auth-submit" type="submit" disabled={busy}>
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
              {!busy && <ChevronRight size={16} />}
            </button>
          </form>
          <div className="auth-security"><span className="security-dot" /> Your account stays on this device. Passwords are securely hashed.</div>
          <button className="admin-entry-link" type="button" onClick={() => { setError(""); setShowAdmin(true); }}>Administrator access <ChevronRight size={13} /></button>
        </div>
        <p className="auth-side-note">Simple by design. Yours by default.</p>
      </section>
    </main>
  );
}

function Dashboard({ initialAuth, theme, onToggleTheme }: { initialAuth: AuthResponse; theme: Theme; onToggleTheme: () => void }) {
  const [auth, setAuth] = useState(initialAuth);
  const [view, setView] = useState<View>("today");
  const [todos, setTodos] = useState<Todo[]>([]);
  const [taskLists, setTaskLists] = useState<TaskListMeta[]>([]);
  const [loadingTodos, setLoadingTodos] = useState(true);
  const [loadingLists, setLoadingLists] = useState(true);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [showListsManager, setShowListsManager] = useState(false);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [newTaskDate, setNewTaskDate] = useState(dateKey(new Date()));
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [notice, setNotice] = useState("");
  const [busyAction, setBusyAction] = useState(false);

  const loadTodos = useCallback(async () => {
    setLoadingTodos(true);
    try {
      const result = await invoke<Todo[]>("list_todos", { token: auth.token });
      setTodos(sortTodos(result));
    } catch (caught) {
      setNotice(String(caught));
    } finally {
      setLoadingTodos(false);
    }
  }, [auth.token]);

  const loadTaskLists = useCallback(async () => {
    setLoadingLists(true);
    try {
      const result = await invoke<TaskListMeta[]>("list_task_lists", { token: auth.token });
      setTaskLists(result);
      setActiveListId((current) => current && result.some((list) => list.id === current) ? current : null);
    } catch (caught) {
      setNotice(String(caught));
    } finally {
      setLoadingLists(false);
    }
  }, [auth.token]);

  const loadWeather = useCallback(async (location: string) => {
    if (!location.trim()) {
      setWeather(null);
      setWeatherError("");
      return;
    }
    setWeatherLoading(true);
    setWeatherError("");
    try {
      const result = await getWeatherForCity(location);
      setWeather(result);
    } catch (caught) {
      setWeather(null);
      setWeatherError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  useEffect(() => { void loadTodos(); }, [loadTodos]);
  useEffect(() => { void loadTaskLists(); }, [loadTaskLists]);
  useEffect(() => { void loadWeather(auth.user.weatherLocation); }, [auth.user.weatherLocation, loadWeather]);

  const today = dateKey(new Date());
  const todayTodos = useMemo(() => todos.filter((todo) => todo.dueDate === today), [todos, today]);
  const openToday = todayTodos.filter((todo) => !todo.completed);
  const completedToday = todayTodos.filter((todo) => todo.completed);
  const upcomingTodos = todos.filter((todo) => !todo.completed && todo.dueDate > today).slice(0, 5);
  const completedCount = todayTodos.length - openToday.length;
  const completion = todayTodos.length ? Math.round((completedCount / todayTodos.length) * 100) : 0;

  function startNewTask(date = today) {
    setNewTaskDate(date);
    setShowTaskModal(true);
  }

  async function createTask(values: { title: string; details: string; dueDate: string; listId: string }) {
    const created = await invoke<Todo>("create_todo", {
      token: auth.token,
      title: values.title,
      details: values.details,
      dueDate: values.dueDate,
      listId: values.listId,
    });
    setTodos((current) => sortTodos([...current, created]));
    setShowTaskModal(false);
  }

  async function toggleTask(todo: Todo) {
    try {
      await invoke("set_todo_completed", { token: auth.token, id: todo.id, completed: !todo.completed });
      setTodos((current) => current.map((item) => item.id === todo.id ? { ...item, completed: !item.completed } : item));
    } catch (caught) {
      setNotice(String(caught));
    }
  }

  async function deleteTask(todo: Todo) {
    try {
      await invoke("delete_todo", { token: auth.token, id: todo.id });
      setTodos((current) => current.filter((item) => item.id !== todo.id));
    } catch (caught) {
      setNotice(String(caught));
    }
  }

  function updateUser(user: User) {
    setAuth((current) => ({ ...current, user }));
  }

  async function signOut() {
    setBusyAction(true);
    try {
      await invoke("logout_user", { token: auth.token });
      window.location.reload();
    } catch (caught) {
      setNotice(String(caught));
    } finally {
      setBusyAction(false);
    }
  }

  const activeList = taskLists.find((list) => list.id === activeListId) ?? null;
  const visibleTodos = activeListId ? todos.filter((todo) => todo.listId === activeListId) : todos;
  const title = view === "today" ? "Today" : view === "calendar" ? "Calendar" : activeList?.name ?? "All tasks";
  const subtitle = view === "today"
    ? formatDate(new Date(), { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : view === "calendar" ? "A little perspective on the days ahead." : activeList ? `A focused view of your ${activeList.name.toLowerCase()} list.` : "Everything you have planned, in one place.";

  return (
    <main className="app-shell flex min-h-screen">
      <aside className="sidebar">
        <div className="brand-lockup sidebar-brand"><div className="brand-mark">d</div><span>daymark</span></div>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={view === "today" ? "nav-item active" : "nav-item"} type="button" onClick={() => { setActiveListId(null); setView("today"); }}>
            <Circle size={17} strokeWidth={1.8} /><span>Today</span><span className="nav-count">{openToday.length || ""}</span>
          </button>
          <button className={view === "calendar" ? "nav-item active" : "nav-item"} type="button" onClick={() => { setActiveListId(null); setView("calendar"); }}>
            <CalendarDays size={17} strokeWidth={1.8} /><span>Calendar</span>
          </button>
          <button className={view === "tasks" ? "nav-item active" : "nav-item"} type="button" onClick={() => { setActiveListId(null); setView("tasks"); }}>
            <CheckCheck size={17} strokeWidth={1.8} /><span>All tasks</span><span className="nav-count">{todos.length || ""}</span>
          </button>
        </nav>
        <div className="sidebar-divider" />
        <div className="sidebar-list-heading"><div className="sidebar-section-label">YOUR LISTS</div><button className="icon-button manage-lists-button" type="button" onClick={() => setShowListsManager(true)} title="Manage lists" aria-label="Manage lists"><Settings2 size={14} /></button></div>
        <div className="list-nav">
          {taskLists.map((list) => (
            <button className={`list-nav-item ${activeListId === list.id ? "active" : ""}`} type="button" key={list.id} onClick={() => { setActiveListId(list.id); setView("tasks"); }}>
              <i className="list-dot" style={{ backgroundColor: list.color }} /><span>{list.name}</span><span>{todos.filter((todo) => todo.listId === list.id && !todo.completed).length}</span>
            </button>
          ))}
          {loadingLists && taskLists.length === 0 && <span className="list-loading">Loading lists…</span>}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-date-card">
            <p className="eyebrow">TODAY</p>
            <strong>{formatDate(new Date(), { day: "2-digit" })}</strong>
            <span>{formatDate(new Date(), { month: "long", year: "numeric" })}</span>
          </div>
          <div className="profile-row flex items-center">
            <div className="avatar">{auth.user.name.slice(0, 1).toUpperCase()}</div>
            <div className="profile-copy"><strong>{auth.user.name}</strong><span>{auth.user.email}</span></div>
            <button className="icon-button profile-logout" type="button" onClick={() => void signOut()} disabled={busyAction} aria-label="Sign out" title="Sign out"><ChevronDown size={16} /></button>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{title}</strong></div>
          <div className="header-actions flex items-center">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <span className="header-date">{formatDate(new Date(), { weekday: "short", month: "short", day: "numeric" })}</span>
            <button className="button button-dark add-task-button" type="button" onClick={() => startNewTask(view === "calendar" ? selectedDate : today)}><Plus size={16} /> New task</button>
          </div>
        </header>

        <div className="workspace-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{view === "today" ? "YOUR DAILY OVERVIEW" : view === "calendar" ? "PLAN WITH PERSPECTIVE" : "YOUR PERSONAL WORKSPACE"}</p>
              <h1>{view === "today" ? `${greeting()}, ${auth.user.name.split(" ")[0]}.` : title}</h1>
              <p>{subtitle}</p>
            </div>
          </div>

          {notice && (
            <div className="notice-bar" role="status"><span>{notice}</span><button type="button" className="icon-button" onClick={() => setNotice("")} aria-label="Dismiss message"><X size={15} /></button></div>
          )}

          <div className="dashboard-grid">
            <div className="primary-column">
              {view === "today" && (
                <>
                  <section className="panel focus-panel">
                    <div className="focus-panel-header">
                      <div>
                        <p className="eyebrow">A GOOD PLACE TO START</p>
                        <h2>Today’s focus</h2>
                      </div>
                      <span className="focus-progress-label">{completedCount} of {todayTodos.length} done</span>
                    </div>
                    <div className="progress-track"><span style={{ width: `${completion}%` }} /></div>
                    {loadingTodos ? <div className="loading-line">Loading your tasks…</div> : (
                      <TaskList
                        todos={openToday}
                        onToggle={toggleTask}
                        onDelete={deleteTask}
                        emptyTitle={todayTodos.length ? "All caught up" : "Nothing planned for today"}
                        emptyText={todayTodos.length ? "You have made it through your list." : "Start with one small thing. The rest can wait."}
                      />
                    )}
                    {completedToday.length > 0 && (
                      <div className="completed-group">
                        <p className="completed-label"><Check size={13} /> COMPLETED · {completedToday.length}</p>
                        <TaskList todos={completedToday} onToggle={toggleTask} onDelete={deleteTask} />
                      </div>
                    )}
                    <button className="add-inline-button" type="button" onClick={() => startNewTask(today)}><Plus size={16} /> Add a task</button>
                  </section>

                  <section className="panel upcoming-panel">
                    <div className="panel-heading">
                      <div><p className="eyebrow">LOOKING AHEAD</p><h2>Coming up</h2></div>
                      <button className="text-button" type="button" onClick={() => { setActiveListId(null); setView("tasks"); }}>View all <ChevronRight size={14} /></button>
                    </div>
                    {loadingTodos ? <div className="loading-line">Loading your tasks…</div> : (
                      <TaskList
                        todos={upcomingTodos}
                        onToggle={toggleTask}
                        onDelete={deleteTask}
                        showDate
                        emptyTitle="Nothing coming up"
                        emptyText="Your next few days are looking clear."
                      />
                    )}
                  </section>
                </>
              )}

              {view === "calendar" && (
                <CalendarView
                  todos={todos}
                  selectedDate={selectedDate}
                  setSelectedDate={setSelectedDate}
                  month={month}
                  setMonth={setMonth}
                  onAdd={startNewTask}
                  onToggle={toggleTask}
                  onDelete={deleteTask}
                />
              )}

              {view === "tasks" && (
                <section className="panel all-tasks-panel">
                  <div className="panel-heading all-tasks-heading">
                    <div><p className="eyebrow">{activeList ? "YOUR SELECTED LIST" : "ALL YOUR PLANS"}</p><h2>{activeList ? activeList.name : "Task overview"}</h2></div>
                    <span className="task-total">{visibleTodos.length} total</span>
                  </div>
                  {loadingTodos ? <div className="loading-line">Loading your tasks…</div> : (
                    <>
                      <div className="task-overview-stats">
                        <div><strong>{visibleTodos.filter((todo) => !todo.completed).length}</strong><span>Open</span></div>
                        <div><strong>{visibleTodos.filter((todo) => todo.completed).length}</strong><span>Completed</span></div>
                        <div><strong>{visibleTodos.filter((todo) => todo.dueDate < today && !todo.completed).length}</strong><span>Past due</span></div>
                      </div>
                      <TaskList
                        todos={visibleTodos}
                        onToggle={toggleTask}
                        onDelete={deleteTask}
                        showDate
                        emptyTitle="Your list is empty"
                        emptyText="Add a task and it will show up here."
                      />
                    </>
                  )}
                  <button className="add-inline-button" type="button" onClick={() => startNewTask()}><Plus size={16} /> Add a task</button>
                </section>
              )}
            </div>

            <aside className="secondary-column">
              <WeatherCard
                user={auth.user}
                token={auth.token}
                weather={weather}
                loading={weatherLoading}
                error={weatherError}
                onSaved={updateUser}
              />
              <section className="panel daily-note-panel">
                <p className="eyebrow">A MOMENT TO PAUSE</p>
                <div className="note-mark"><Sun size={18} strokeWidth={1.5} /></div>
                <h3>One thing at a time.</h3>
                <p>You don’t need to do everything today. Just the next thing.</p>
              </section>
              <section className="week-summary">
                <div className="week-summary-icon"><CalendarDays size={17} strokeWidth={1.7} /></div>
                <div><span>Next 7 days</span><strong>{todos.filter((todo) => !todo.completed && todo.dueDate >= today && todo.dueDate <= dateKey(new Date(Date.now() + 6 * 86400000))).length} open tasks</strong></div>
                <button className="icon-button" type="button" aria-label="Open calendar" onClick={() => { setActiveListId(null); setView("calendar"); }}><ChevronRight size={16} /></button>
              </section>
            </aside>
          </div>
          <footer className="workspace-footer"><span>Daymark</span><span>Keep your days in view.</span></footer>
        </div>
      </section>

      {showTaskModal && taskLists.length > 0 && <TaskModal initialDate={newTaskDate} initialListId={activeListId ?? taskLists[0].id} lists={taskLists} onClose={() => setShowTaskModal(false)} onCreate={createTask} />}
      {showListsManager && <ListsManager token={auth.token} lists={taskLists} onClose={() => setShowListsManager(false)} onChanged={async () => { await loadTaskLists(); await loadTodos(); }} />}
    </main>
  );
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = window.localStorage.getItem("daymark-theme");
      if (saved === "light" || saved === "dark") return saved;
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem("daymark-theme", theme);
    } catch {
      // Theme still works for the current session when storage is unavailable.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => current === "dark" ? "light" : "dark");
  }, []);

  return (
    <div className="app-theme-root" data-theme={theme}>
      <AuthScreen theme={theme} onToggleTheme={toggleTheme} />
    </div>
  );
}
