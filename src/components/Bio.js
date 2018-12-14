import React from 'react'

// Import typefaces
import 'typeface-montserrat'
import 'typeface-merriweather'

import profilePic from './bbb.png'
import { rhythm } from '../utils/typography'

class Bio extends React.Component {
  render() {
    return (
      <div
        style={{
          display: 'flex',
          marginBottom: rhythm(2.5),
        }}
      >
        <img
          src={profilePic}
          alt={`Dan Abramov`}
          style={{
            marginRight: rhythm(1 / 2),
            marginBottom: 0,
            width: rhythm(2),
            height: rhythm(2),
            borderRadius: 40,
          }}
        />
        <p style={{ maxWidth: 250 }}>
          Personal blog by <a href="https://github.com/xuzhanhh">xuzhanhh</a>.
          <br></br>
          {' '}
          😋
        </p>
      </div>
    )
  }
}

export default Bio
