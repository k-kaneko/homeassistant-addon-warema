const warema = require('warema-wms-venetian-blinds');
var mqtt = require('mqtt')

process.on('SIGINT', function() {
    process.exit(0);
});


const ignoredDevices = process.env.IGNORED_DEVICES ? process.env.IGNORED_DEVICES.split(',') : []
const forceDevices = process.env.FORCE_DEVICES ? process.env.FORCE_DEVICES.split(',') : []

const settingsPar = {
    wmsChannel   : process.env.WMS_CHANNEL     || 17,
    wmsKey       : process.env.WMS_KEY         || '00112233445566778899AABBCCDDEEFF',
    wmsPanid     : process.env.WMS_PAN_ID      || 'FFFF',
    wmsSerialPort: process.env.WMS_SERIAL_PORT || '/dev/ttyUSB0',
  };

var registered_shades = []
var shade_position = []

function registerDevice(element) {
  console.log('Registering ' + element.snr)
  var topic = 'homeassistant/cover/' + element.snr + '/' + element.snr + '/config'
  var availability_topic = ''homeassistant/cover/' + element.snr + '/availability'

  var base_payload = {
    name: element.snr,
    availability: [
      {topic: 'warema/bridge/state'},
      {topic: availability_topic}
    ],
    unique_id: element.snr
  }

  var base_device = {
    identifiers: element.snr,
    manufacturer: "Warema",
    name: element.snr
  }

  var model
  var payload
  switch (parseInt(element.type)) {
    case 6:
      model = 'Weather Station'
      payload = {
        ...base_payload,
        device: {
          ...base_device,
          model: model
        }
      }
      break
    // WMS WebControl Pro - while part of the network, we have no business to do with it.
    case 9:
      return
    case 20:
      model = 'Plug receiver'
      payload = {
        ...base_payload,
        device: {
          ...base_device,
          model: model
        },
        position_open: 0,
        position_closed: 100,
        command_topic: 'warema/' + element.snr + '/set',
        position_topic: 'warema/' + element.snr + '/position',
        tilt_status_topic: 'warema/' + element.snr + '/tilt',
        set_position_topic: 'warema/' + element.snr + '/set_position',
        tilt_command_topic: 'warema/' + element.snr + '/set_tilt',
        tilt_closed_value: -100,
        tilt_opened_value: 100,
        tilt_min: -100,
        tilt_max: 100,
      }
      break
    case 21:
      model = 'Actuator UP'
      payload = {
        ...base_payload,
        device: {
          ...base_device,
          model: model
        },
        position_open: 0,
        position_closed: 100,
        command_topic: 'warema/' + element.snr + '/set',
        position_topic: 'warema/' + element.snr + '/position',
        tilt_status_topic: 'warema/' + element.snr + '/tilt',
        set_position_topic: 'warema/' + element.snr + '/set_position',
        tilt_command_topic: 'warema/' + element.snr + '/set_tilt',
        tilt_closed_value: -100,
        tilt_opened_value: 100,
        tilt_min: -100,
        tilt_max: 100,
      }
      break
    case 25:
      model = 'Vertical awning'
      payload = {
        ...base_payload,
        device: {
          ...base_device,
          model: model
        },
        position_open: 0,
        position_closed: 100,
        command_topic: 'warema/' + element.snr + '/set',
        position_topic: 'warema/' + element.snr + '/position',
        set_position_topic: 'warema/' + element.snr + '/set_position',
      }
      break
    case 63:
      model = 'Weather Station PLUS'
      payload = {
        ...base_payload,
        device: {
          ...base_device,
          model: model
        }
      }          
      break

    default:
      console.log('Unrecognized device type: ' + element.type)
      model = 'Unknown model ' + element.type
      return
  }

  if (ignoredDevices.includes(element.snr.toString())) {
    console.log('Ignoring and removing device ' + element.snr + ' (type ' + element.type + ')')
  } else {
    console.log('Adding device ' + element.snr + ' (type ' + element.type + ')')

    stickUsb.vnBlindAdd(parseInt(element.snr), element.snr.toString());
    registered_shades += element.snr
    if (parseInt(element.type) == 63) {
      client.publish('homeassistant/binary_sensor/warema/' + element.snr + '/availability', 'online', {retain: true})
    } else {
      client.publish(availability_topic, 'online', {retain: true})
    }
  }
  if (parseInt(element.type) == 63) {
    client.publish('homeassistant/binary_sensor/warema/' + element.snr + '/config', JSON.stringify(payload))
  } else {
    client.publish(topic, JSON.stringify(payload))
  }
}

function registerDevices() {
  if (forceDevices && forceDevices.length) {
    forceDevices.forEach(element => {
      registerDevice({snr: element, type: 25})
    })
  } else {
    console.log('Scanning...')
    stickUsb.scanDevices({autoAssignBlinds: false});
  }
}

function callback(err, msg) {
  if(err) {
    console.log('ERROR: ' + err);
  }
  if(msg) {
    switch (msg.topic) {
      case 'wms-vb-init-completion':
        console.log('Warema init completed')
        registerDevices()
        stickUsb.setPosUpdInterval(30000);
        break
      case 'wms-vb-rcv-weather-broadcast':
//        if ( 0 ) {
         if (registered_shades.includes(msg.payload.weather.snr)) {
          client.publish('homeassistant/sensor/warema/' + msg.payload.weather.snr + '/illuminance/state', msg.payload.weather.lumen.toString())
          client.publish('homeassistant/sensor/warema/' + msg.payload.weather.snr + '/temperature/state', msg.payload.weather.temp.toString())
          client.publish('homeassistant/binary_sensor/warema/' + msg.payload.weather.snr + '/rain/state', msg.payload.weather.rain.toString())
          client.publish('homeassistant/sensor/warema/' + msg.payload.weather.snr + '/wind_speed/state', msg.payload.weather.wind.toString())
        } else {
          var availability_topic = 'homeassistant/binary_sensor/warema/' + msg.payload.weather.snr + '/availability'
          var payload = {
            name: msg.payload.weather.snr,
            availability: [
              {topic: 'warema/bridge/state'},
              {topic: availability_topic}
            ],
            device: {
              identifiers: msg.payload.weather.snr,
              manufacturer: 'Warema',
              model: 'Weather Station PLUS',
              name: msg.payload.weather.snr
            },
            force_update: true
          }

          var illuminance_payload = {
            ...payload,
            state_topic: 'homeassistant/sensor/warema/' + msg.payload.weather.snr + '/illuminance/state',
            device_class: 'illuminance',
            unique_id: msg.payload.weather.snr + '_illuminance',
            unit_of_measurement: 'lx',
          }
          client.publish('homeassistant/sensor/warema' + msg.payload.weather.snr + '/illuminance/config', JSON.stringify(illuminance_payload))

          var temperature_payload = {
            ...payload,
            state_topic: 'homeassistant/sensor/warema/' + msg.payload.weather.snr + '/temperature/state',
            device_class: 'temperature',
            unique_id: msg.payload.weather.snr + '_temperature',
            unit_of_measurement: '°C',
          }
          client.publish('homeassistant/sensor/warema/' + msg.payload.weather.snr + '/temperature/config', JSON.stringify(temperature_payload))
              
          var rain_payload = {
            ...payload,
            state_topic: 'homeassistant/binary_sensor/warema/' + msg.payload.weather.snr + '/rain/state',
            unique_id: msg.payload.weather.snr + '_rain',
          }
          client.publish('homeassistant/binary_sensor/warema/' + msg.payload.weather.snr + '/rain/config', JSON.stringify(rain_payload))

          var wind_payload = {
            ...payload,
            state_topic: 'homeassistant/sensor/warema/' + msg.payload.weather.snr + '/wind_speed/state',
            device_class: 'wind_speed',
            unique_id: msg.payload.weather.snr + '_wind_speed',
            unit_of_measurement: 'm/s',
          }
          client.publish('homeassistant/sensor/warema/' + msg.payload.weather.snr + '/wind_speed/config', JSON.stringify(wind_payload))
              
          client.publish(availability_topic, 'online', {retain: true})
          registered_shades += msg.payload.weather.snr
        }
        break
      case 'wms-vb-blind-position-update':
        client.publish('warema/' + msg.payload.snr + '/position', msg.payload.position.toString())
        client.publish('warema/' + msg.payload.snr + '/tilt', msg.payload.angle.toString())
        shade_position[msg.payload.snr] = {
          position: msg.payload.position,
          angle: msg.payload.angle
        }
        break
      case 'wms-vb-scanned-devices':
        console.log('Scanned devices.')
        msg.payload.devices.forEach(element => registerDevice(element))
        console.log(stickUsb.vnBlindsList())
        break
      default:
        console.log('UNKNOWN MESSAGE: ' + JSON.stringify(msg));
    }
  }
}

var client = mqtt.connect(
  process.env.MQTT_SERVER,
  {
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASSWORD,
    will: {
      topic: 'warema/bridge/state',
      payload: 'offline',
      retain: true
    }
  }
)

var stickUsb

client.on('connect', function (connack) {
  console.log('Connected to MQTT')
  client.subscribe('warema/#')
  client.subscribe('homeassistant/status')
  stickUsb = new warema(settingsPar.wmsSerialPort,
    settingsPar.wmsChannel,
    settingsPar.wmsPanid,
    settingsPar.wmsKey,
    {},
    callback
  );
})

client.on('error', function (error) {
  console.log('MQTT Error: ' + error.toString())
})

client.on('message', function (topic, message) {
  // console.log(topic + ':' + message.toString())
  var scope = topic.split('/')[0]
  if (scope == 'warema') {
    var device = parseInt(topic.split('/')[1])
    var command = topic.split('/')[2]
    switch (command) {
      case 'set':
        switch (message.toString()) {
          case 'CLOSE':
            stickUsb.vnBlindSetPosition(device, 100)
            break;
          case 'OPEN':
            stickUsb.vnBlindSetPosition(device, 0)
            break;
          case 'STOP':
            stickUsb.vnBlindStop(device)
            break;
        }
        break
      case 'set_position':
        stickUsb.vnBlindSetPosition(device, parseInt(message), parseInt(shade_position[device]['angle']))
        break
      case 'set_tilt':
        stickUsb.vnBlindSetPosition(device, parseInt(shade_position[device]['position']), parseInt(message))
        break
      //default:
      //  console.log('Unrecognised command from HA')
    }
  } else if (scope == 'homeassistant') {
    if (topic.split('/')[1] == 'status' && message.toString() == 'online') {
      registerDevices()
    }
  }
})
