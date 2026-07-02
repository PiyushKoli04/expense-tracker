/* ============================================
   FIRESTORE — firestore.js
   Generic Firestore CRUD Helpers
   ============================================ */

const FirestoreService = (() => {

  /**
   * Add a document to a collection
   * @param {string} collectionName
   * @param {object} data
   * @returns {object} { success, id, error }
   */
  async function addDocument(collectionName, data) {
    try {
      const docRef = await db.collection(collectionName).add({
        ...data,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return { success: true, id: docRef.id };
    } catch (error) {
      console.error(`Error adding to ${collectionName}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get a single document by ID
   * @param {string} collectionName
   * @param {string} docId
   * @returns {object|null}
   */
  async function getDocument(collectionName, docId) {
    try {
      const doc = await db.collection(collectionName).doc(docId).get();
      if (doc.exists) {
        return { id: doc.id, ...doc.data() };
      }
      return null;
    } catch (error) {
      console.error(`Error getting ${collectionName}/${docId}:`, error);
      return null;
    }
  }

  /**
   * Get documents with query filters
   * @param {string} collectionName
   * @param {Array} filters - Array of [field, operator, value]
   * @param {object} options - { orderBy, orderDir, limit }
   * @returns {Array}
   */
  async function getDocuments(collectionName, filters = [], options = {}) {
    try {
      let query = db.collection(collectionName);

      // Apply filters
      filters.forEach(([field, operator, value]) => {
        query = query.where(field, operator, value);
      });

      // Apply ordering
      let queryWithOrder = query;
      if (options.orderBy) {
        queryWithOrder = queryWithOrder.orderBy(options.orderBy, options.orderDir || 'desc');
      }

      // Apply limit
      if (options.limit) {
        queryWithOrder = queryWithOrder.limit(options.limit);
      }

      try {
        const snapshot = await queryWithOrder.get();
        const documents = [];
        snapshot.forEach(doc => {
          documents.push({ id: doc.id, ...doc.data() });
        });
        return documents;
      } catch (innerError) {
        // Fallback for missing composite index or other query ordering issues
        if (options.orderBy) {
          console.warn(`Query with orderBy failed for ${collectionName}. Falling back to client-side sorting:`, innerError);
          
          // Query without orderBy and without limit (so we sort all filtered matches first before limiting)
          const snapshotFallback = await query.get();
          let documents = [];
          snapshotFallback.forEach(doc => {
            documents.push({ id: doc.id, ...doc.data() });
          });

          // Sort client-side
          const field = options.orderBy;
          const isDesc = (options.orderDir || 'desc') === 'desc';
          documents.sort((a, b) => {
            let valA = a[field];
            let valB = b[field];

            // Normalize firestore timestamps
            if (valA && typeof valA.toDate === 'function') valA = valA.toDate();
            if (valB && typeof valB.toDate === 'function') valB = valB.toDate();
            if (valA && valA.seconds !== undefined) valA = valA.seconds;
            if (valB && valB.seconds !== undefined) valB = valB.seconds;

            // Handle date comparison for date strings or timestamps
            if (field === 'date' || field === 'purchaseDate' || field === 'createdAt') {
              valA = valA ? new Date(valA) : new Date(0);
              valB = valB ? new Date(valB) : new Date(0);
            }

            if (valA < valB) return isDesc ? 1 : -1;
            if (valA > valB) return isDesc ? -1 : 1;
            return 0;
          });

          // Apply limit client-side
          if (options.limit) {
            documents = documents.slice(0, options.limit);
          }

          return documents;
        } else {
          throw innerError;
        }
      }
    } catch (error) {
      console.error(`Error querying ${collectionName}:`, error);
      return [];
    }
  }

  /**
   * Update a document
   * @param {string} collectionName
   * @param {string} docId
   * @param {object} data
   * @returns {object} { success, error }
   */
  async function updateDocument(collectionName, docId, data) {
    try {
      await db.collection(collectionName).doc(docId).update({
        ...data,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return { success: true };
    } catch (error) {
      console.error(`Error updating ${collectionName}/${docId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a document
   * @param {string} collectionName
   * @param {string} docId
   * @returns {object} { success, error }
   */
  async function deleteDocument(collectionName, docId) {
    try {
      await db.collection(collectionName).doc(docId).delete();
      return { success: true };
    } catch (error) {
      console.error(`Error deleting ${collectionName}/${docId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set a document (create or overwrite)
   * @param {string} collectionName
   * @param {string} docId
   * @param {object} data
   * @param {boolean} merge
   * @returns {object} { success, error }
   */
  async function setDocument(collectionName, docId, data, merge = true) {
    try {
      await db.collection(collectionName).doc(docId).set(data, { merge });
      return { success: true };
    } catch (error) {
      console.error(`Error setting ${collectionName}/${docId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all documents for a user (filtered by userId)
   * @param {string} collectionName
   * @param {string} userId
   * @param {object} options - { orderBy, orderDir, limit }
   * @returns {Array}
   */
  async function getUserDocuments(collectionName, userId, options = {}) {
    return getDocuments(collectionName, [['userId', '==', userId]], options);
  }

  /**
   * Get all documents for a group (filtered by groupId)
   * @param {string} collectionName
   * @param {string} groupId
   * @param {object} options - { orderBy, orderDir, limit }
   * @returns {Array}
   */
  async function getGroupDocuments(collectionName, groupId, options = {}) {
    return getDocuments(collectionName, [['groupId', '==', groupId]], options);
  }

  /**
   * Batch delete multiple documents
   * @param {string} collectionName
   * @param {Array} docIds
   * @returns {object} { success, error }
   */
  async function batchDelete(collectionName, docIds) {
    try {
      const batch = db.batch();
      docIds.forEach(id => {
        const ref = db.collection(collectionName).doc(id);
        batch.delete(ref);
      });
      await batch.commit();
      return { success: true };
    } catch (error) {
      console.error(`Error batch deleting from ${collectionName}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate a unique invite code
   * @returns {string}
   */
  function generateInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  return {
    addDocument,
    getDocument,
    getDocuments,
    updateDocument,
    deleteDocument,
    setDocument,
    getUserDocuments,
    getGroupDocuments,
    batchDelete,
    generateInviteCode
  };
})();
