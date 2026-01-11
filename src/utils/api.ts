import axios from "axios";
import { Edition, Surah, Ayah } from "../types";
import { Cache, getPreferenceValues } from "@raycast/api";
import { DEFAULT_ARABIC_EDITION } from "./constants";

/**
 * @constant BASE_URL - the base URL for the API
 */
const BASE_URL = "https://api.alquran.cloud/v1";

/**
 * @description - the axios instance for the API with the base URL and headers
 */
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

const cache = new Cache();

type AyahEditionResponse = { edition: { identifier: string } } & Ayah;

const getSurahCacheKey = (surahNumber: number, edition: string): string => `surah-${surahNumber}-${edition}`;
const getSurahListCacheKey = (edition: string): string => `surahs-${edition}`;

const tryGetSurahInfoFromCache = (surahNumber: number, edition: string): Surah | null => {
  try {
    const cachedSurahs = cache.get(getSurahListCacheKey(edition));
    if (!cachedSurahs) {
      return null;
    }

    const surahList = JSON.parse(cachedSurahs) as Surah[];
    const match = surahList.find((surah) => surah.number === surahNumber);
    if (!match) {
      return null;
    }

    return match;
  } catch (error) {
    console.error("Failed to read cached surah list", error);
    return null;
  }
};

const attachSurahInfo = (ayah: Ayah, surahInfo: Surah | null): Ayah => {
  if (!surahInfo) {
    return ayah;
  }

  if (ayah.surah && ayah.surah.number === surahInfo.number) {
    return ayah;
  }

  return { ...ayah, surah: surahInfo };
};

const tryGetAyahFromSurahCache = (surahNumber: number, ayahNumber: number, edition: string): Ayah | null => {
  try {
    const cachedSurah = cache.get(getSurahCacheKey(surahNumber, edition));
    if (!cachedSurah) {
      return null;
    }

    const ayahs = JSON.parse(cachedSurah) as Ayah[];
    const ayah = ayahs.find((item) => item.numberInSurah === ayahNumber);
    if (!ayah) {
      return null;
    }

    const surahInfo = tryGetSurahInfoFromCache(surahNumber, edition);
    return attachSurahInfo(ayah, surahInfo);
  } catch (error) {
    console.error("Failed to read cached surah", error);
    return null;
  }
};

const parseReference = (reference: string): { surahNumber: number; ayahNumber: number } | null => {
  const [rawSurah, rawAyah] = reference.split(/[:/]/);
  if (!rawSurah || !rawAyah) {
    return null;
  }

  const surahNumber = Number.parseInt(rawSurah.trim(), 10);
  const ayahNumber = Number.parseInt(rawAyah.trim(), 10);

  if (Number.isNaN(surahNumber) || Number.isNaN(ayahNumber)) {
    return null;
  }

  return { surahNumber, ayahNumber };
};

/**
 * @function getEdition - get the edition from user configuration
 * @returns {string} - the edition from user configuration
 */
export const getEdition = (): string => {
  return getPreferenceValues<Edition>().edition;
};

/**
 * @function getSurahs - get the surahs from the API
 * @returns {Promise} - the promise of the API call
 */

export const getSurah = async (): Promise<Surah[]> => {
  try {
    const { data } = await api.get(`/surah`);
    return data.data;
  } catch (error) {
    console.error(error);
    return [];
  }
};

/**
 * @function getAyahs - get the ayahs from the API
 * @param {number} surahNumber - the surah number
 * @returns {Promise} - the promise of the API call
 */

export const getAyahs = async (surahNumber: number): Promise<Ayah[]> => {
  try {
    const userEdition = getEdition();
    const { data } = await api.get(`/surah/${surahNumber}/editions/${userEdition},${DEFAULT_ARABIC_EDITION}`);
    const editions = data.data as { edition: { identifier: string }; ayahs: Ayah[] }[];
    const translationEdition = editions.find(({ edition }) => edition.identifier === userEdition);
    const arabicEdition = editions.find(({ edition }) => edition.identifier === DEFAULT_ARABIC_EDITION);

    if (!translationEdition) {
      return [];
    }

    const arabicAyahMap = new Map((arabicEdition?.ayahs ?? []).map((ayah) => [ayah.numberInSurah, ayah.text]));

    return translationEdition.ayahs.map((ayah) => ({
      ...ayah,
      arabicText: arabicAyahMap.get(ayah.numberInSurah),
    }));
  } catch (error) {
    console.error(error);
    return [];
  }
};

export const getAyahByReference = async (reference: string): Promise<Ayah | null> => {
  try {
    const userEdition = getEdition();
    const parsedReference = parseReference(reference);

    if (parsedReference) {
      const cachedAyah = tryGetAyahFromSurahCache(parsedReference.surahNumber, parsedReference.ayahNumber, userEdition);
      if (cachedAyah) {
        return cachedAyah;
      }
    }

    const normalizedReference = parsedReference
      ? `${parsedReference.surahNumber}:${parsedReference.ayahNumber}`
      : reference;

    const { data } = await api.get(`/ayah/${normalizedReference}/editions/${userEdition},${DEFAULT_ARABIC_EDITION}`);
    const editions = data.data as AyahEditionResponse[];
    const translationEdition = editions.find(({ edition }) => edition.identifier === userEdition);

    if (!translationEdition) {
      return null;
    }

    const arabicEdition = editions.find(({ edition }) => edition.identifier === DEFAULT_ARABIC_EDITION);
    const translationAyah = { ...translationEdition };
    delete translationAyah.edition;

    return {
      ...translationAyah,
      arabicText: arabicEdition?.text,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
};
