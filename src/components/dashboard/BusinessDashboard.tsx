import React from 'react'
import { BusinessTile } from './BusinessTile'
import { ConsumerDashboard } from './ConsumerDashboard'

export function BusinessDashboard() {
  return (
    <div className="p-6">
      <BusinessTile />
      <div style={{ margin: '0 -24px' }}>
        <ConsumerDashboard />
      </div>
    </div>
  )
}
