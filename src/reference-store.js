let connection;

function openStore() {
  if (!connection) {
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open('motion-room-references', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('lessons');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Reference storage is busy.'));
    }).catch(error => {
      connection = undefined;
      throw error;
    });
  }
  return connection;
}

async function withStore(mode, operation) {
  const database = await openStore();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('lessons', mode);
    const request = operation(transaction.objectStore('lessons'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error ?? new Error('Reference storage was interrupted.'));
  });
}

export const readReference = lessonId => withStore('readonly', store => store.get(lessonId));
export const saveReference = (lessonId, record) => withStore('readwrite', store => store.put(record, lessonId));
export const deleteReference = lessonId => withStore('readwrite', store => store.delete(lessonId));
