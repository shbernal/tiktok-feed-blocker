import { vi } from 'vitest'

type Listener<TArgs extends unknown[], TResult = void> = (
  ...args: TArgs
) => TResult

const createChromeEvent = <TArgs extends unknown[], TResult = void>() => {
  const listeners = new Set<Listener<TArgs, TResult>>()

  return {
    addListener: vi.fn((listener: Listener<TArgs, TResult>) => {
      listeners.add(listener)
    }),
    removeListener: vi.fn((listener: Listener<TArgs, TResult>) => {
      listeners.delete(listener)
    }),
    emit: (...args: TArgs) => {
      return Array.from(listeners, listener => listener(...args))
    },
    listeners: () => Array.from(listeners),
  }
}

type StorageValues = Record<string, unknown>
type StorageChange = chrome.storage.StorageChange
type StorageChanges = Record<string, StorageChange>
type StorageChangedArgs = [StorageChanges, chrome.storage.AreaName]
type RuntimeMessageArgs = [
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
]
type CommandArgs = [command: string]

export const createChromeMock = () => {
  const values: StorageValues = {}
  const storageChanged = createChromeEvent<StorageChangedArgs>()
  const runtimeMessage = createChromeEvent<RuntimeMessageArgs, boolean>()
  const command = createChromeEvent<CommandArgs, Promise<void> | void>()

  const local = {
    get: vi.fn((keys: string[], callback: (items: StorageValues) => void) => {
      callback(Object.fromEntries(keys.map(key => [key, values[key]])))
    }),
    set: vi.fn((items: StorageValues, callback?: () => void) => {
      const changes = Object.fromEntries(
        Object.entries(items).map(([key, newValue]) => [
          key,
          {
            oldValue: values[key],
            newValue,
          },
        ]),
      )

      Object.assign(values, items)

      if (Object.keys(changes).length > 0) {
        storageChanged.emit(changes, 'local')
      }

      callback?.()
    }),
    seed: (items: StorageValues) => {
      Object.assign(values, items)
    },
  }

  return {
    commands: {
      onCommand: command,
      getAll: vi.fn(
        (callback: (commands: chrome.commands.Command[]) => void) => {
          callback([
            {
              name: 'toggle-current-page-block',
              description: 'Toggle blocking for the current TikTok page',
              shortcut: 'Ctrl+Shift+8',
            },
          ])
        },
      ),
    },
    runtime: {
      lastError: undefined,
      onMessage: runtimeMessage,
    },
    storage: {
      local,
      onChanged: storageChanged,
    },
    tabs: {
      query: vi.fn(
        (
          _queryInfo: chrome.tabs.QueryInfo,
          callback: (tabs: chrome.tabs.Tab[]) => void,
        ) => {
          callback([])
        },
      ),
      sendMessage: vi.fn(
        (
          _tabId: number,
          _message: unknown,
          callback?: (response?: unknown) => void,
        ) => {
          callback?.()
        },
      ),
    },
  }
}

export type ChromeMock = ReturnType<typeof createChromeMock>

let currentChromeMock: ChromeMock | null = null

export const installChromeMock = () => {
  currentChromeMock = createChromeMock()
  vi.stubGlobal('chrome', currentChromeMock)
  return currentChromeMock
}

export const getChromeMock = () => {
  if (!currentChromeMock) {
    throw new Error('Chrome mock has not been installed')
  }

  return currentChromeMock
}
