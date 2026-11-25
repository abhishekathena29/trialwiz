import { useId, useMemo, useState } from 'react';
import { exactHospital, suggestHospitals, type Hospital } from '../data/hospitals';

/**
 * Hospital name field with suggestions from the hospital directory, so the same hospital is stored
 * under one name instead of a mix of abbreviations and long forms. Choosing a suggestion saves the
 * directory's standard name and hands the entry to `onPick` (to fill city/state). A hospital that
 * isn't listed is kept exactly as typed; an exact abbreviation ("RGCIRC", "AIIMS Jodhpur") is
 * expanded to the standard name when the field loses focus.
 */
export function HospitalInput({
  id,
  value,
  onChange,
  onPick,
  className,
  placeholder = 'Start typing — e.g. AIIMS New Delhi, Tata Memorial, RGCIRC',
  required,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onPick?: (hospital: Hospital) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const suggestions = useMemo(() => suggestHospitals(value), [value]);
  // Nothing to suggest once the field already holds a listed name.
  const isStandard = suggestions.some((h) => h.name === value);
  const show = open && !disabled && value.trim().length >= 2 && !isStandard;

  function pick(h: Hospital) {
    onChange(h.name);
    onPick?.(h);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!show || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(suggestions[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  function onBlur() {
    setOpen(false);
    setActive(-1);
    const exact = exactHospital(value);
    if (exact && exact.name !== value) pick(exact);
  }

  return (
    <div className="hosp-combo">
      <input
        id={id}
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
      />
      {show && (
        <ul className="hosp-list" id={listId} role="listbox">
          {suggestions.map((h, i) => (
            <li
              key={h.name}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'on' : ''}
              // mousedown, not click: it fires before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(h);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="hosp-name">{h.name}</span>
              <span className="hosp-where">
                {h.city}, {h.state}
                {h.aliases?.length ? ` · ${h.aliases.slice(0, 2).join(', ')}` : ''}
              </span>
            </li>
          ))}
          <li className="hosp-foot" role="presentation">
            {suggestions.length === 0
              ? 'Not in our list — your hospital name will be saved as typed.'
              : 'Not listed? Keep typing — your entry will be saved as typed.'}
          </li>
        </ul>
      )}
    </div>
  );
}
