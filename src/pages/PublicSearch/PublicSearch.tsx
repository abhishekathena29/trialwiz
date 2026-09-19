import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { logDemand } from '../../analytics/demandLog';
import { logUsage } from '../../analytics/usageLog';
import { Logo } from '../../components/Logo';
import { CITIES, matchCity } from '../../data/cities';
import { REGIONS, normalizeState } from '../../data/regions';
import { useAuthUser } from '../../hooks/useAuthUser';
import { useFavorites } from '../../hooks/useFavorites';
import { useTrialCatalogue } from '../../hooks/useTrialCatalogue';
import type { TrialSite } from '../../types';
import { centreKey } from '../../utils/format';
import { haversineKm } from '../../utils/geo';
import { groupByNctId, type GroupedTrial } from '../../utils/groupTrials';
import './PublicSearch.css';
import { BrowseByCancer } from './BrowseByCancer';
import { BrowseByCentre } from './BrowseByCentre';
import { CancerTypeIcon, CentreIcon, HeartIcon, SearchIcon } from './icons';
import { LocationBar } from './LocationBar';
import { SavedTrials } from './SavedTrials';
import { SearchPanel, type SearchFilters } from './SearchPanel';
import { TrialDetail } from './TrialDetail';
import { TrialListView } from './TrialListView';

type Seg = 'cancer' | 'centre' | 'search' | 'saved';
type LocMode = 'none' | 'gps' | 'city' | 'region';
type ActiveList = { kind: 'cancer'; value: string } | { kind: 'centre'; facility: string; city: string } | null;

export function PublicSearch() {
  const { rows, loading, error, fetchedAt, refetch } = useTrialCatalogue();
  const { user, loading: authLoading } = useAuthUser();
  const { favorites, isFavorite, toggleFavorite } = useFavorites(user);

  const [locMode, setLocMode] = useState<LocMode>('none');
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [cityInput, setCityInput] = useState('');
  const [allIndia, setAllIndia] = useState(false);
  const [radius, setRadius] = useState(300);
  const [locMsg, setLocMsg] = useState('');
  const [locating, setLocating] = useState(false);
  const [region, setRegion] = useState<string | null>(null);
  const [regionState, setRegionState] = useState<string | null>(null);

  const [seg, setSeg] = useState<Seg>('cancer');
  const [group, setGroup] = useState<'solid' | 'blood' | 'pediatric'>('solid');
  const [system, setSystem] = useState('All');
  const [activeList, setActiveList] = useState<ActiveList>(null);
  const [searchResults, setSearchResults] = useState<TrialSite[] | null>(null);
  const [detailTrial, setDetailTrial] = useState<GroupedTrial | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  function scrollToResults() {
    resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openDetail(trial: GroupedTrial) {
    setDetailTrial(trial);
  }

  function handleToggleFavorite(trial: GroupedTrial) {
    if (!user) {
      setDetailTrial(null);
      setSeg('saved');
      return;
    }
    const wasFavorite = isFavorite(trial);
    toggleFavorite(trial);
    logUsage('favorite', wasFavorite ? 'remove' : 'add', trial.nctId);
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocMode('none');
      setCoords(null);
      setLocMsg("This device can't share location — type a city instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocMode('gps');
        setCoords([p.coords.latitude, p.coords.longitude]);
        setCityInput('');
        setAllIndia(false);
        setRegion(null);
        setRegionState(null);
        setLocMsg('');
        setLocating(false);
        logUsage('location', 'GPS — my location');
      },
      () => {
        setLocating(false);
        setLocMode('none');
        setCoords(null);
        setLocMsg('Location permission not given — tap Allow, or type a city.');
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  }

  function onCityChange(v: string) {
    setCityInput(v);
    if (v.trim()) {
      setLocMode('city');
      setAllIndia(false);
      setRegion(null);
      setRegionState(null);
      setLocMsg('');
    } else if (locMode === 'city') {
      setLocMode('none');
    }
  }

  function onAllIndiaChange(v: boolean) {
    setAllIndia(v);
    if (v) {
      setRegion(null);
      setRegionState(null);
      logUsage('location', 'All India');
    }
  }

  function selectRegion(name: string) {
    setLocMode('region');
    setRegion(name);
    setRegionState(null);
    setAllIndia(false);
    setCityInput('');
    setLocMsg('');
    logUsage('location', name);
    setTimeout(scrollToResults, 0);
  }

  function selectRegionState(state: string | null) {
    setRegionState(state);
    if (state) logUsage('location', state, region ?? undefined);
  }

  function clearRegion() {
    setRegion(null);
    setRegionState(null);
    if (locMode === 'region') setLocMode('none');
  }

  const activeCoords = useMemo<[number, number] | null>(() => {
    if (allIndia) return null;
    if (locMode === 'gps') return coords;
    if (locMode === 'city') {
      const c = matchCity(cityInput.trim());
      return CITIES[c] ?? null;
    }
    return null;
  }, [allIndia, locMode, coords, cityInput]);

  const radiusEnabled = !allIndia && locMode !== 'region' && activeCoords != null;

  // Region-agnostic scope (radius/city/All India, ignoring any region already picked) — used to
  // grey out region buttons that have no trials "in play" for the current slider/city search.
  const radiusScopedRows = useMemo<TrialSite[]>(() => {
    if (allIndia || !activeCoords) return rows;
    return rows.filter(
      (r) => r.lat != null && r.lon != null && haversineKm(activeCoords[0], activeCoords[1], r.lat, r.lon) <= radius,
    );
  }, [rows, allIndia, activeCoords, radius]);
  const radiusOfLabel =
    locMode === 'gps' ? 'your current location' : locMode === 'city' ? matchCity(cityInput.trim()) || cityInput : 'your current location';

  const whereLabel = useMemo(() => {
    if (locMode === 'region' && region) return regionState ? `${regionState}, ${region}` : `Across ${region}`;
    if (allIndia) return 'Across India';
    if (locMode === 'gps' && activeCoords) return `Within ${radius} km of your current location`;
    if (locMode === 'city' && activeCoords) return `Within ${radius} km of ${matchCity(cityInput.trim())}`;
    if (locMode === 'city' && !activeCoords) return `Across India — "${cityInput.trim()}" not recognised`;
    return 'Across India — set a location to search nearby';
  }, [allIndia, locMode, activeCoords, radius, cityInput, region, regionState]);

  const heroChip = useMemo(() => {
    if (locMode === 'region' && region) return regionState ? `${regionState}` : region;
    if (allIndia) return 'All India';
    if (locMode === 'gps' && activeCoords) return `${radius} km · your location`;
    if (locMode === 'city' && activeCoords) return `${radius} km · ${matchCity(cityInput.trim())}`;
    return null;
  }, [allIndia, locMode, activeCoords, radius, cityInput, region, regionState]);

  const locLabelForLog =
    locMode === 'region' && region
      ? regionState
        ? `${regionState} (${region})`
        : region
      : allIndia
        ? 'All India'
        : locMode === 'gps'
          ? 'My location'
          : locMode === 'city'
            ? matchCity(cityInput.trim())
            : '—';

  const scopedRows = useMemo<TrialSite[]>(() => {
    if (locMode === 'region' && region) {
      const allowed = regionState ? [regionState] : REGIONS[region];
      return rows.filter((r) => allowed.includes(normalizeState(r.state))).map((r) => ({ ...r, distanceKm: null }));
    }
    if (allIndia || !activeCoords) return rows.map((r) => ({ ...r, distanceKm: null }));
    return rows
      .filter((r) => r.lat != null && r.lon != null)
      .map((r) => ({ ...r, distanceKm: haversineKm(activeCoords[0], activeCoords[1], r.lat as number, r.lon as number) }))
      .filter((r) => (r.distanceKm as number) <= radius);
  }, [rows, allIndia, activeCoords, radius, locMode, region, regionState]);

  function openCancer(cancerType: string) {
    setActiveList({ kind: 'cancer', value: cancerType });
    const matches = scopedRows.filter((r) => r.cancerType === cancerType).sort((a, b) => (a.distanceKm ?? 9e9) - (b.distanceKm ?? 9e9));
    logDemand({ cond: cancerType, where: locLabelForLog, line: 'any', met: 'any', bio: '', resultCount: matches.length });
    logUsage('browse', cancerType, locLabelForLog);
  }

  function openCentre(facility: string, city: string) {
    setActiveList({ kind: 'centre', facility, city });
    const key = centreKey(facility, city);
    const matches = scopedRows
      .filter((r) => centreKey(r.facility, r.city) === key)
      .sort((a, b) => (a.distanceKm ?? 9e9) - (b.distanceKm ?? 9e9));
    logDemand({
      cond: matches[0]?.cancerType ?? '(browse)',
      where: `${facility}, ${city}`,
      line: 'any',
      met: 'any',
      bio: '',
      resultCount: matches.length,
    });
    logUsage('browse', `${facility}, ${city}`);
  }

  function runSearch(filters: SearchFilters) {
    const cond = filters.cond;
    let recs = scopedRows;
    if (cond) {
      const lc = cond.toLowerCase();
      recs = recs.filter((r) => r.cancerType.toLowerCase().includes(lc) || r.conditions.some((c) => c.toLowerCase().includes(lc)));
    }
    recs = recs.filter((r) => {
      if (filters.bio) {
        const lc = filters.bio.toLowerCase();
        const hay = `${r.briefTitle} ${r.eligibilityCriteria ?? ''}`.toLowerCase();
        if (!hay.includes(lc)) return false;
      }
      if (filters.met !== 'any' && r.metastatic !== filters.met) return false;
      if (filters.line !== 'any' && r.lineOfTherapy !== filters.line) return false;
      if (filters.other) {
        const lc = filters.other.toLowerCase();
        const hay = `${r.briefTitle} ${r.briefSummary ?? ''} ${r.conditions.join(' ')} ${r.cancerType} ${r.facility} ${r.city} ${r.nctId}`.toLowerCase();
        if (!hay.includes(lc)) return false;
      }
      return true;
    });
    recs = [...recs].sort((a, b) => (a.distanceKm ?? 9e9) - (b.distanceKm ?? 9e9));
    setSearchResults(recs);
    logDemand({ cond: cond || '(any cancer)', where: locLabelForLog, line: filters.line, met: filters.met, bio: filters.bio, resultCount: recs.length });
    logUsage('search', cond || '(any cancer)', filters.other ? `other:${filters.other}` : undefined);
  }

  function changeSeg(s: Seg) {
    setSeg(s);
    setActiveList(null);
    setDetailTrial(null);
  }

  const activeListRows = useMemo<GroupedTrial[]>(() => {
    if (!activeList) return [];
    const filtered = scopedRows.filter((r) =>
      activeList.kind === 'cancer' ? r.cancerType === activeList.value : centreKey(r.facility, r.city) === centreKey(activeList.facility, activeList.city),
    );
    return groupByNctId(filtered);
  }, [activeList, scopedRows]);

  const groupedScopedRows = useMemo(() => groupByNctId(scopedRows), [scopedRows]);
  const n = groupedScopedRows.length;
  const syncLabel = fetchedAt
    ? `🗂 Trial data synced ${new Date(fetchedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · live from ClinicalTrials.gov`
    : '🗂 Syncing with ClinicalTrials.gov…';

  return (
    <div className="tw-public">
      <header className="top">
        <div className="top-inner">
          <Logo />
          <div className="brand">
            <h1>TrialWiz&nbsp;·&nbsp;Trial Finder</h1>
            <p className="byline">by Dr. Veenoo Agarwal</p>
            <p>Recruiting cancer trials in India — plain language, near your patient</p>
          </div>
          <div className="headnav">
            <Link className="navlink" to="/portal">
              Provider login
            </Link>
            <button className="accountpill" onClick={() => changeSeg('saved')} title={user ? user.email ?? '' : 'Sign in to save trials'}>
              {user ? user.email : 'Sign in'}
            </button>
            <span className="modebadge on">live API</span>
          </div>
        </div>
      </header>

      <div className="wrap">
        <div className="hero">
          <div className="bigrow">
            <div
              className={`big${n > 0 ? ' clickable' : ''}`}
              onClick={n > 0 ? scrollToResults : undefined}
              title={n > 0 ? 'Jump to the trial list' : undefined}
            >
              {loading && rows.length === 0 ? '—' : n}
            </div>
            {activeList && (
              <div className="heroFiltered">
                <span className="arrow">↳</span>
                <span className="fnum">{activeListRows.length}</span>
                <span className="flabel">{activeList.kind === 'cancer' ? activeList.value : activeList.facility}</span>
                <button className="heroBack" onClick={() => setActiveList(null)}>
                  ‹ all trials
                </button>
              </div>
            )}
          </div>
          <div className="sub">
            {loading && rows.length === 0
              ? 'Loading recruiting cancer trials from ClinicalTrials.gov…'
              : n === 0
                ? 'No recruiting trials in this area — try a wider radius or All India.'
                : 'recruiting cancer trials, ready to browse and share.'}
          </div>
          <div className="whereline">📍 {whereLabel}</div>
          <div className="herochips">
            <span className="herochip">📍 {heroChip ?? 'Across India'}</span>
          </div>
          <div className="synced">
            {syncLabel}
            <button onClick={() => refetch()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh now'}
            </button>
          </div>
        </div>

        <div className="seg">
          <button className={seg === 'cancer' ? 'on' : ''} onClick={() => changeSeg('cancer')}>
            <CancerTypeIcon />
            <span>By cancer type</span>
          </button>
          <button className={seg === 'centre' ? 'on' : ''} onClick={() => changeSeg('centre')}>
            <CentreIcon />
            <span>By centre</span>
          </button>
          <button className={seg === 'search' ? 'on' : ''} onClick={() => changeSeg('search')}>
            <SearchIcon />
            <span>Search</span>
          </button>
          <button className={seg === 'saved' ? 'on' : ''} onClick={() => changeSeg('saved')}>
            <HeartIcon filled={seg === 'saved'} />
            <span>Saved</span>
          </button>
        </div>

        <div className={`locbarwrap${seg === 'cancer' ? '' : ' hide-on-mobile'}`}>
          <LocationBar
            locating={locating}
            locActive={locMode === 'gps'}
            locButtonLabel={locMode === 'gps' ? 'Using your location' : 'Use my location'}
            cityInput={cityInput}
            allIndia={allIndia}
            radiusEnabled={radiusEnabled}
            radiusOfLabel={radiusOfLabel}
            radius={radius}
            locMsg={locMsg}
            rows={radiusScopedRows}
            region={region}
            regionState={regionState}
            onRequestLocation={requestLocation}
            onCityChange={onCityChange}
            onAllIndiaChange={onAllIndiaChange}
            onRadiusChange={setRadius}
            onSelectRegion={selectRegion}
            onSelectRegionState={selectRegionState}
            onClearRegion={clearRegion}
          />
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div ref={resultsRef}>
        {detailTrial ? (
          <TrialDetail
            trial={detailTrial}
            onBack={() => setDetailTrial(null)}
            isFavorite={isFavorite(detailTrial)}
            onToggleFavorite={() => handleToggleFavorite(detailTrial)}
          />
        ) : activeList ? (
          <TrialListView
            title={activeList.kind === 'cancer' ? activeList.value : activeList.facility}
            subtitle={activeList.kind === 'cancer' ? whereLabel.replace('Across India', 'across India') : activeList.city}
            rows={activeListRows}
            onBack={() => setActiveList(null)}
            onOpenDetail={openDetail}
            isFavorite={isFavorite}
            onToggleFavorite={handleToggleFavorite}
          />
        ) : seg === 'cancer' ? (
          <BrowseByCancer
            rows={scopedRows}
            group={group}
            system={system}
            onGroupChange={setGroup}
            onSystemChange={setSystem}
            onOpenCancer={openCancer}
          />
        ) : seg === 'centre' ? (
          <BrowseByCentre rows={scopedRows} onOpenCentre={openCentre} />
        ) : seg === 'search' ? (
          <SearchPanel
            scopedCount={groupedScopedRows.length}
            scopeWhereLabel={whereLabel.replace('Across India', 'across India')}
            results={searchResults}
            onSearch={runSearch}
            onOpenDetail={openDetail}
            isFavorite={isFavorite}
            onToggleFavorite={handleToggleFavorite}
          />
        ) : (
          <SavedTrials
            user={user}
            authLoading={authLoading}
            favorites={favorites}
            rows={rows}
            onOpenDetail={openDetail}
            onToggleFavorite={handleToggleFavorite}
          />
        )}
        </div>
      </div>

      <footer className="disc">
        <b>An information directory of publicly registered clinical trials.</b> It does not determine eligibility or
        give medical advice, and is not a substitute for the treating doctor. Only the trial investigator at the
        site can determine eligibility.
      </footer>
    </div>
  );
}
