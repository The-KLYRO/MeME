export const COMMAND_IDS = {
  enable: 'memeSounds.enable',
  disable: 'memeSounds.disable',
  toggleMute: 'memeSounds.toggleMute',
  testSuccessSound: 'memeSounds.testSuccessSound',
  testWarningSound: 'memeSounds.testWarningSound',
  testErrorSound: 'memeSounds.testErrorSound',
  testFailedSound: 'memeSounds.testFailedSound',
  runCommandWithLiveMonitor: 'memeSounds.runCommandWithLiveMonitor',
  runTaskWithLiveMonitor: 'memeSounds.runTaskWithLiveMonitor',
  attachMonitorToTask: 'memeSounds.attachMonitorToTask',
  reloadPresets: 'memeSounds.reloadPresets',
  openOutputLog: 'memeSounds.openOutputLog'
} as const;

export const MUTE_STATE_KEY = 'memeSounds.muted';
