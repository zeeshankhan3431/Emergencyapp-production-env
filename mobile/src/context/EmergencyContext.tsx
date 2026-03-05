/**
 * EmergencyContext.tsx
 * Global state for the emergency flow.
 * Wrap your app root with <EmergencyProvider> so any screen can
 * read / mutate emergency state without prop-drilling.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useReducer,
  useRef,
} from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmergencyStatus =
  | 'IDLE'
  | 'IMPACT_DETECTED'   // sensor fired, waiting for confirmation
  | 'CONFIRMING'        // 10-s countdown running
  | 'ESCALATING'        // calling 911 + recording
  | 'ACTIVE'            // emergency in progress
  | 'RESOLVED';         // user cancelled or responders notified

export interface EmergencyState {
  status: EmergencyStatus;
  sessionId: string | null;
  impactTimestamp: number | null;
  confirmationDeadline: number | null; // epoch ms when countdown expires
  scenarioMessage: string;
  location: { lat: number; lng: number } | null;
}

type Action =
  | { type: 'IMPACT_DETECTED'; impactTimestamp: number }
  | { type: 'START_CONFIRMATION'; deadline: number }
  | { type: 'USER_CONFIRMED_SAFE' }
  | { type: 'ESCALATE'; sessionId: string }
  | { type: 'SET_ACTIVE' }
  | { type: 'SET_LOCATION'; location: { lat: number; lng: number } }
  | { type: 'SET_SCENARIO'; message: string }
  | { type: 'RESOLVE' };

// ─── Reducer ──────────────────────────────────────────────────────────────────

const initialState: EmergencyState = {
  status: 'IDLE',
  sessionId: null,
  impactTimestamp: null,
  confirmationDeadline: null,
  scenarioMessage: 'Emergency – I need help.',
  location: null,
};

function reducer(state: EmergencyState, action: Action): EmergencyState {
  switch (action.type) {
    case 'IMPACT_DETECTED':
      return {
        ...state,
        status: 'IMPACT_DETECTED',
        impactTimestamp: action.impactTimestamp,
      };
    case 'START_CONFIRMATION':
      return {
        ...state,
        status: 'CONFIRMING',
        confirmationDeadline: action.deadline,
      };
    case 'USER_CONFIRMED_SAFE':
      return { ...initialState };
    case 'ESCALATE':
      return {
        ...state,
        status: 'ESCALATING',
        sessionId: action.sessionId,
      };
    case 'SET_ACTIVE':
      return { ...state, status: 'ACTIVE' };
    case 'SET_LOCATION':
      return { ...state, location: action.location };
    case 'SET_SCENARIO':
      return { ...state, scenarioMessage: action.message };
    case 'RESOLVE':
      return { ...initialState };
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface EmergencyContextValue {
  state: EmergencyState;
  dispatch: React.Dispatch<Action>;
  /** Convenience helpers */
  markImpact: () => void;
  startCountdown: () => void;
  confirmSafe: () => void;
  escalate: (sessionId: string) => void;
  resolve: () => void;
}

const EmergencyContext = createContext<EmergencyContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const CONFIRMATION_SECONDS = 10;

export const EmergencyProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markImpact = useCallback(() => {
    dispatch({ type: 'IMPACT_DETECTED', impactTimestamp: Date.now() });
  }, []);

  const startCountdown = useCallback(() => {
    const deadline = Date.now() + CONFIRMATION_SECONDS * 1000;
    dispatch({ type: 'START_CONFIRMATION', deadline });
  }, []);

  const confirmSafe = useCallback(() => {
    if (countdownRef.current) {
      clearTimeout(countdownRef.current);
      countdownRef.current = null;
    }
    dispatch({ type: 'USER_CONFIRMED_SAFE' });
  }, []);

  const escalate = useCallback((sessionId: string) => {
    dispatch({ type: 'ESCALATE', sessionId });
  }, []);

  const resolve = useCallback(() => {
    dispatch({ type: 'RESOLVE' });
  }, []);

  return (
    <EmergencyContext.Provider
      value={{ state, dispatch, markImpact, startCountdown, confirmSafe, escalate, resolve }}>
      {children}
    </EmergencyContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEmergency(): EmergencyContextValue {
  const ctx = useContext(EmergencyContext);
  if (!ctx) {
    throw new Error('useEmergency must be used inside <EmergencyProvider>');
  }
  return ctx;
}