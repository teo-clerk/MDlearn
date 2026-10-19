import { lazy, Suspense } from 'react'
import { Route, Switch, useParams } from 'wouter'
import { Home } from './library/Home'
import { Shell } from './layout/Shell'
import { Spinner } from './ui/primitives'
const TodayPage = lazy(() => import('./today/TodayPage'))

const Reader = lazy(() => import('./reader/Reader'))
const LessonView = lazy(() => import('./lesson/LessonView'))
const StudyPage = lazy(() => import('./study/StudyPage'))
const ProgressPage = lazy(() => import('./progress/ProgressPage'))
const StudioPage = lazy(() => import('./studio/StudioPage'))
const FormulasPage = lazy(() => import('./knowledge/FormulasPage'))
const GlossaryPage = lazy(() => import('./knowledge/GlossaryPage'))
const MapPage = lazy(() => import('./knowledge/MapPage'))
const AskPage = lazy(() => import('./knowledge/AskPage'))
const SheetPage = lazy(() => import('./knowledge/SheetPage'))
const EditPage = lazy(() => import('./editor/EditPage'))

function Workspace() {
  const { ws } = useParams<{ ws: string }>()
  return (
    <Shell ws={ws}>
      <Suspense fallback={<div className="p-10"><Spinner /></div>}>
        <Switch>
          <Route path="/w/:ws/doc"><Reader ws={ws} /></Route>
          <Route path="/w/:ws/lesson"><LessonView ws={ws} /></Route>
          <Route path="/w/:ws/study"><StudyPage ws={ws} /></Route>
          <Route path="/w/:ws/progress"><ProgressPage ws={ws} /></Route>
          <Route path="/w/:ws/studio"><StudioPage ws={ws} /></Route>
          <Route path="/w/:ws/edit"><EditPage ws={ws} /></Route>
          <Route path="/w/:ws/sheet"><SheetPage ws={ws} /></Route>
          <Route path="/w/:ws/ask"><AskPage ws={ws} /></Route>
          <Route path="/w/:ws/formulas"><FormulasPage ws={ws} /></Route>
          <Route path="/w/:ws/glossary"><GlossaryPage ws={ws} /></Route>
          <Route path="/w/:ws/map"><MapPage ws={ws} /></Route>
          <Route><TodayPage ws={ws} /></Route>
        </Switch>
      </Suspense>
    </Shell>
  )
}
export function App() {
  return (
    <Switch>
      <Route path="/w/:ws" nest={false}><Workspace /></Route>
      <Route path="/w/:ws/*"><Workspace /></Route>
      <Route><Home /></Route>
    </Switch>
  )
}
