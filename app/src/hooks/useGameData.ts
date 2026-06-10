import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';

/**
 * Fetches game data (classes, weapons, armor, domain cards, ancestries, communities) from server API.
 * Data is cached in gameStore.gameData. Only fetches once per serverUrl change.
 * Does NOT depend on Socket connection — uses REST API directly.
 */
export function useGameData() {
  const loaded = useGameStore(s => s.gameData.loaded);
  const serverUrl = useGameStore(s => s.serverUrl);

  useEffect(() => {
    if (loaded || !serverUrl) return;

    const fetchAll = async () => {
      try {
        const [classesRes, weaponsRes, armorRes, domainsRes, ancestriesRes, communitiesRes] = await Promise.all([
          fetch(`${serverUrl}/api/data/classes`),
          fetch(`${serverUrl}/api/data/weapons`),
          fetch(`${serverUrl}/api/data/armor`),
          fetch(`${serverUrl}/api/data/domains`),
          fetch(`${serverUrl}/api/data/ancestries`),
          fetch(`${serverUrl}/api/data/communities`),
        ]);

        const classes = await classesRes.json();
        const weapons = await weaponsRes.json();
        const armor = await armorRes.json();
        const domainCards = await domainsRes.json();
        const ancestries = ancestriesRes.ok ? await ancestriesRes.json() : [];
        const communities = communitiesRes.ok ? await communitiesRes.json() : [];

        console.log(`[useGameData] Loaded: ${classes.length} classes, ${weapons.length} weapons, ${armor.length} armor, ${domainCards.length} domainCards, ${ancestries.length} ancestries, ${communities.length} communities`);

        useGameStore.getState().setGameData({
          classes,
          weapons,
          armor,
          domainCards,
          ancestries,
          communities,
          loaded: true,
        });
      } catch (err) {
        console.warn('[useGameData] Failed to fetch game data:', err);
      }
    };

    fetchAll();
  }, [serverUrl, loaded]);
}
