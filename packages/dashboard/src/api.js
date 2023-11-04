import axios from 'axios'
import store from './store'
import preview from '@/preview'

export function encodeKey (key, path = null) {
  if (path) {
    return btoa(unescape(encodeURIComponent(`${path}${key}`)))
  }
  return btoa(unescape(encodeURIComponent(key)))
}

function getCurrentFolder () {
  let prefix = store.state.currentFolder
  if (store.state.activeTab === 'email') {
    prefix = '.r2-explorer/emails/' + store.state.currentFolder + '/'
  }

  return prefix
}

const apiHandler = {
  createFolder: (name) => {
    const folderPath = store.state.currentFolder + name + '/'

    return axios.post(`/api/buckets/${store.state.activeBucket}/folder`, {
      key: encodeKey(folderPath)
    })
  },
  deleteObject: (path, name) => {
    return axios.post(`/api/buckets/${store.state.activeBucket}/delete`, {
      key: encodeKey(name, path)
    })
  },
  downloadFile: (file, onDownloadProgress, abortControl) => {
    const extra = {}
    if (file.preview?.downloadType === 'objectUrl' || file.preview?.downloadType === 'blob') {
      extra.responseType = 'arraybuffer'
    }
    if (abortControl) {
      extra.signal = abortControl.signal
    }
    if (onDownloadProgress) {
      extra.onDownloadProgress = onDownloadProgress
    }

    const filePath = encodeKey(file.name, getCurrentFolder())

    return axios.get(
      `/api/buckets/${store.state.activeBucket}/${filePath}`,
      extra
    )
  },
  renameObject: (oldName, newName) => {
    return axios.post(`/api/buckets/${store.state.activeBucket}/move`, {
      oldKey: encodeKey(oldName, store.state.currentFolder),
      newKey: encodeKey(newName, store.state.currentFolder)
    })
  },
  updateMetadata: (file, metadata) => {
    const filePath = encodeKey(file.name, getCurrentFolder())

    return axios.post(
      `/api/buckets/${store.state.activeBucket}/${filePath}`,
      {
        customMetadata: metadata
      }
    )
  },
  multipartCreate: (file, folder) => {
    return axios.post(`/api/buckets/${store.state.activeBucket}/multipart/create`, null, {
      params: {
        key: encodeKey(file.name, folder),
        httpMetadata: encodeKey(JSON.stringify({
          contentType: file.type
        }))
      }
    })
  },
  multipartComplete: (file, folder, parts, uploadId) => {
    return axios.post(`/api/buckets/${store.state.activeBucket}/multipart/complete`, {
      key: encodeKey(file.name, folder),
      uploadId,
      parts
    })
  },
  multipartUpload: (uploadId, partNumber, key, chunk, callback) => {
    return axios.post(`/api/buckets/${store.state.activeBucket}/multipart/upload`, chunk, {
      params: {
        key: encodeKey(key),
        uploadId,
        partNumber
      },
      onUploadProgress: callback,
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
  },
  uploadObjects: (file, folder, callback) => {
    folder = folder || store.state.currentFolder

    return axios.post(`/api/buckets/${store.state.activeBucket}/upload`, file, {
      params: {
        key: encodeKey(file.name, folder),
        httpMetadata: encodeKey(JSON.stringify({
          contentType: file.type
        }))
      },
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: callback
    })
  },
  listObjects: async () => {
    const prefix = getCurrentFolder()

    let filesConc = []
    let foldersConc = []

    let truncated = true
    let cursor = null

    while (truncated) {
      const response = await axios.get(`/api/buckets/${store.state.activeBucket}?include=customMetadata&include=httpMetadata`, {
        params: {
          delimiter: '/',
          prefix: encodeKey(prefix),
          cursor: cursor
        }
      })

      truncated = response.data.truncated
      cursor = response.data.cursor

      let files = []
      if (response.data.objects) {
        files = response.data.objects.filter(function (obj) {
          return !obj.key.endsWith('/')
        })
        files = files.map(function (obj) {
          const name = obj.key.replace(prefix, '')
          const extension = name.split('.').pop()

          return {
            ...obj,
            name,
            path: store.state.currentFolder,
            extension,
            preview: preview.getType(name),
            isFile: true,
            hash: encodeKey(name)
          }
        }).filter(obj => {
          return !(store.state.config?.showHiddenFiles !== true && obj.name.startsWith('.'))
        })

        for (const f of files) {
          filesConc.push(f)
        }
      }

      let folders = []
      if (response.data.delimitedPrefixes) {
        folders = response.data.delimitedPrefixes.map(function (obj) {
          const split = obj.split('/')
          const name = split[split.length - 2]

          return {
            name,
            path: store.state.currentFolder,
            key: obj,
            isFolder: true,
            hash: encodeKey(obj)
          }
        }).filter(obj => {
          return !(store.state.config?.showHiddenFiles !== true && obj.name.startsWith('.'))
        })

        for (const f of folders) {
          foldersConc.push(f)
        }
      }
    }

    return {
      files: filesConc.reverse(),
      folders: foldersConc
    }
  }
}

export default apiHandler
