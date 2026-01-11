import axios from "axios";
import { LocalStorage } from "@raycast/api";
import { FavoriteAyah, Surah } from "../types";
import { DEFAULT_ARABIC_EDITION } from "./constants";

const FAVORITES_STORAGE_KEY = "favorites";
const AL_QURAN_API_BASE_URL = "https://api.alquran.cloud/v1";

/**
 * Read favorites from local storage (defaults to empty array).
 */
const readFavoritesFromStorage = async (): Promise<FavoriteAyah[]> => {
  return JSON.parse((await LocalStorage.getItem(FAVORITES_STORAGE_KEY)) || "[]");
};

/**
 * Write favorites to local storage.
 */
const writeFavoritesToStorage = async (favorites: FavoriteAyah[]): Promise<void> => {
  await LocalStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
};

/**
 * Fetch the Arabic text for a specific ayah.
 */
const fetchArabicAyahText = async (surahNumber: number, ayahNumber: number): Promise<string | undefined> => {
  try {
    const { data } = await axios.get(
      `${AL_QURAN_API_BASE_URL}/ayah/${surahNumber}:${ayahNumber}/${DEFAULT_ARABIC_EDITION}`,
    );
    return data?.data?.text;
  } catch (error) {
    console.error(error);
    return undefined;
  }
};

/**
 * Ensure a favorite ayah has Arabic text (falls back to fetching if missing).
 */
const ensureArabicText = async (favorite: FavoriteAyah): Promise<FavoriteAyah> => {
  if (favorite.arabicText) {
    return favorite;
  }

  const arabicText = await fetchArabicAyahText(favorite.surahNumber, favorite.ayahNumber);
  return arabicText ? { ...favorite, arabicText } : favorite;
};

/**
 * Migrates stored favorites so they include Arabic text.
 */
const migrateFavoritesIfNeeded = async (favorites: FavoriteAyah[]): Promise<FavoriteAyah[]> => {
  if (!favorites.some((favorite) => !favorite.arabicText)) {
    return favorites;
  }

  const migratedFavorites = await Promise.all(favorites.map(ensureArabicText));
  await writeFavoritesToStorage(migratedFavorites);
  return migratedFavorites;
};

/**
 * Public helper to overwrite favorites in storage.
 */
export const saveFavoriteAyahs = async (favorites: FavoriteAyah[]): Promise<void> => {
  await writeFavoritesToStorage(favorites);
};

export const addAyahToFavorites = async (ayah: FavoriteAyah) => {
  const favorites = await readFavoritesFromStorage();
  await writeFavoritesToStorage([...favorites, ayah]);
};

export const removeAyahFromFavorites = async (ayah: FavoriteAyah) => {
  const favorites = await readFavoritesFromStorage();
  await writeFavoritesToStorage(
    favorites.filter(
      (favorite) => favorite.ayahNumber !== ayah.ayahNumber || favorite.surahNumber !== ayah.surahNumber,
    ),
  );
};

export const filterSurahs = (surahs: Surah[] | null | undefined, searchText: string): Surah[] | undefined => {
  if (!surahs) {
    return undefined;
  }

  return surahs.filter(
    (surah) =>
      surah.englishName.toLowerCase().includes(searchText.toLowerCase()) ||
      surah.number.toString().includes(searchText.toLowerCase()),
  );
};

export const getFavoriteAyahs = async (): Promise<FavoriteAyah[]> => {
  const favorites = await readFavoritesFromStorage();
  return migrateFavoritesIfNeeded(favorites);
};
