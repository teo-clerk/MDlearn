import { useEngines } from '../api/queries'
export function useEngineInfo() { const e = useEngines(); return { local: e.data?.local, claude: e.data?.claude } }
