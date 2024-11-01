# amina_s
Zigbee2MQTT external converter for Amina S EV Charger

Currently tested on Z2M 1.40.1

Created by @somlioy


|     |     |
|-----|-----|
| Model | amina S  |
| Vendor  | amina distribution AS  |
| Description | Amina S EV Charger |
| Exposes | charge_limit, alarms, alarm_active, power, voltage, current, power_phase_b, power_phase_c, voltage_phase_b, voltage_phase_c, current_phase_b, current_phase_c, state, ev_status, total_active_power, total_active_energy, last_session_energy, single_phase, enable_offline, time_to_offline, offline_current, offline_single_phase, linkquality |
| Picture | ![Amina S](amina_s.png) |


The EV Charger requires atleast firmware version 1.8.7 to have support of every expose of this external converter.
You can check the firmware version by reading the `swBuildId` attribute in cluster `genBasic`, endpoint `10` after pairing, by using the Dev console in Zigbee2MQTT.

New firmware and firmware update guide can be found here: https://doc.clickup.com/9004130215/p/h/8cb07x7-30795/12688a97b1dfa55


As of now, the exposes `total_active_energy` and `last_session_energy` is not updated automatically as the attributes are not reportable.

Make sure that the following binds are enabled under Amina device - Bind: `genBasic`, `genOnOff`, `haElectricalMeasurement`, `genLevelCtrl`, `aminaControlCluster`

The `ev_status` attribute is an enum which can be any of the following values:

| `ev_status` |
| --- |
| Unknown status: *#status*
| Not connected |
| EV Connected |
| Ready to charge |
| Charging |
| Paused |

Where `#status` is the bit coded integer recieved from the device.

The `alarms` attribute is an array which can hold any combination of the following values:

| `alarms` |
| --- |
| Welded relay(s) |
| Wrong voltage balance |
| RDC-DD DC Leakage |
| RDC-DD AC Leakage |
| Temperature error |
| Overvoltage alarm |
| Overcurrent alarm |
| Car communication error |
| Charger processing error |
| Critical overcurrent alarm |


## Installation

https://www.zigbee2mqtt.io/guide/configuration/more-config-options.html#external-converters

1. In your `zigbee2mqtt` data folder, next to the `configuration.yaml` file, add `amina_s.js`.
2. Open your Zigbee2MQTT addon Web UI, navigate to settings, then external converters
3. Click the '+' button, and type `amina_s.js` into the text box which appears.
4. Click submit and restart Zigbee2mqtt

## Pairing
When Amina S is powered up it will start looking for networks to join. If it has been associated with a network it will try and find this network.

Amina S will for the first 5 minutes after power on event look for a network to join on all Zigbee channels in the 2.4GHz range intensively, and then gradually look for networks with less and less "eagerness". This means that the highest probability of finding a network will be the first 5 minutes after power on.

You can use the install code to facilitate the joining process.
