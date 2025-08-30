/**
 * Firestore Storage Hook
 * Replaces localStorage with Firestore cloud storage
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  deleteDoc, 
  getDocs,
  query,
  orderBy,
  Unsubscribe
} from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase-secure';

export function useFirestoreCollection<T extends { id?: string }>(
  collectionName: string,
  defaultValue: T[] = []
): [T[], (newValue: T[] | ((prev: T[]) => T[])) => Promise<void>, boolean] {
  const [data, setData] = useState<T[]>(defaultValue);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Listen to Firestore changes in real-time
  useEffect(() => {
    if (!user) {
      setData(defaultValue);
      setLoading(false);
      return;
    }

    setLoading(true);
    
    const collectionRef = collection(db, 'users', user.uid, collectionName);
    const q = query(collectionRef, orderBy('createdAt', 'desc'));

    const unsubscribe: Unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: T[] = [];
        snapshot.forEach((doc) => {
          const docData = doc.data();
          items.push({
            ...docData,
            id: doc.id
          } as T);
        });
        
        console.log(`Firestore ${collectionName} updated:`, items.length, 'items');
        setData(items);
        setLoading(false);
      },
      (error) => {
        console.error(`Error listening to ${collectionName}:`, error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, collectionName, defaultValue]);

  // Update Firestore data
  const updateData = useCallback(async (newValue: T[] | ((prev: T[]) => T[])) => {
    if (!user) {
      console.warn('Cannot update data: user not authenticated');
      return;
    }

    try {
      const valueToStore = typeof newValue === 'function' 
        ? newValue(data)
        : newValue;

      const collectionRef = collection(db, 'users', user.uid, collectionName);
      
      // Get current documents to determine what to add/update/delete
      const currentSnapshot = await getDocs(collectionRef);
      const currentIds = new Set<string>();
      currentSnapshot.forEach(doc => currentIds.add(doc.id));

      // Process new data
      const newIds = new Set<string>();
      const promises: Promise<void>[] = [];

      valueToStore.forEach((item) => {
        const itemId = item.id || doc(collectionRef).id;
        newIds.add(itemId);

        const docRef = doc(collectionRef, itemId);
        promises.push(
          setDoc(docRef, {
            ...item,
            id: itemId,
            updatedAt: new Date(),
            createdAt: item.id ? undefined : new Date() // Only set createdAt for new items
          }, { merge: true })
        );
      });

      // Delete removed items
      currentIds.forEach(id => {
        if (!newIds.has(id)) {
          const docRef = doc(collectionRef, id);
          promises.push(deleteDoc(docRef));
        }
      });

      await Promise.all(promises);
      console.log(`Updated ${collectionName} in Firestore`);

    } catch (error) {
      console.error(`Error updating ${collectionName}:`, error);
      throw error;
    }
  }, [user, data, collectionName]);

  return [data, updateData, loading];
}

/**
 * Hook for single document storage (like settings)
 */
export function useFirestoreDocument<T>(
  collectionName: string,
  documentId: string,
  defaultValue: T
): [T, (newValue: T | ((prev: T) => T)) => Promise<void>, boolean] {
  const [data, setData] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Listen to document changes
  useEffect(() => {
    if (!user) {
      setData(defaultValue);
      setLoading(false);
      return;
    }

    setLoading(true);
    
    const docRef = doc(db, 'users', user.uid, collectionName, documentId);

    const unsubscribe: Unsubscribe = onSnapshot(
      docRef,
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          const docData = docSnapshot.data() as T;
          console.log(`Firestore document ${collectionName}/${documentId} updated:`, docData);
          setData(docData);
        } else {
          console.log(`Firestore document ${collectionName}/${documentId} does not exist, using default`);
          setData(defaultValue);
        }
        setLoading(false);
      },
      (error) => {
        console.error(`Error listening to document ${collectionName}/${documentId}:`, error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, collectionName, documentId, defaultValue]);

  // Update document
  const updateData = useCallback(async (newValue: T | ((prev: T) => T)) => {
    if (!user) {
      console.warn('Cannot update document: user not authenticated');
      return;
    }

    try {
      const valueToStore = typeof newValue === 'function' 
        ? (newValue as (prev: T) => T)(data)
        : newValue;

      const docRef = doc(db, 'users', user.uid, collectionName, documentId);
      await setDoc(docRef, {
        ...valueToStore,
        updatedAt: new Date()
      }, { merge: true });

      console.log(`Updated document ${collectionName}/${documentId} in Firestore`);

    } catch (error) {
      console.error(`Error updating document ${collectionName}/${documentId}:`, error);
      throw error;
    }
  }, [user, data, collectionName, documentId]);

  return [data, updateData, loading];
}
