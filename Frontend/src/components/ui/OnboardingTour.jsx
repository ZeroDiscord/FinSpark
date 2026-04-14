import { useState, useEffect } from 'react'
import { Joyride, STATUS } from 'react-joyride'
import TourTooltip from './TourTooltip.jsx'

const TOUR_STEPS = [
  {
    target: 'body',
    title: 'Welcome to FinSpark!',
    content: "Let's take a quick walk through your Enterprise Intelligence dashboard and explore what you can do.",
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: '#tour-workspace-selection',
    title: 'Your Workspaces',
    content: "Select any ready workspace to dive directly into its Enterprise Analytics Dashboard, or request a new one.",
    placement: 'top',
    disableBeacon: true,
  },
  {
    target: '#tour-nav-workspaces',
    title: 'Workspace Management',
    content: 'This is your home base. You can always return here to switch contexts or manage tenants.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '#tour-nav-upload',
    title: 'Bring Your Data',
    content: 'Upload mock datasets mapped to UI elements to identify user behavior and conversion flows.',
    placement: 'right',
    disableBeacon: true,
  },
  {
    target: '#tour-nav-intelligence',
    title: 'Intelligence & Analytics',
    content: 'Leverage ML-driven insights predicting user churn, feature adoption, and behavioral patterns.',
    placement: 'right',
    disableBeacon: true,
  }
]

export default function OnboardingTour() {
  const [run, setRun] = useState(false)

  useEffect(() => {
    const isCompleted = localStorage.getItem('finspark_tour_completed')
    // A small delay to let the DOM settle before showing the tour
    if (!isCompleted) {
      setTimeout(() => {
        setRun(true)
      }, 500)
    }
  }, [])

  const handleJoyrideCallback = (data) => {
    const { status } = data
    const finishedStatuses = [STATUS.FINISHED, STATUS.SKIPPED]

    if (finishedStatuses.includes(status)) {
      setRun(false)
      localStorage.setItem('finspark_tour_completed', 'true')
    }
  }

  return (
    <Joyride
      callback={handleJoyrideCallback}
      continuous
      hideCloseButton={false}
      run={run}
      scrollToFirstStep
      showProgress={false}
      showSkipButton
      steps={TOUR_STEPS}
      tooltipComponent={TourTooltip}
      disableOverlayClose
      styles={{
        options: {
          zIndex: 10000,
        },
      }}
    />
  )
}
