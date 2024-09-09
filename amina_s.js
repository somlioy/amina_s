const {deviceAddCustomCluster, onOff, binary, numeric, enumLookup, electricityMeter} = require('zigbee-herdsman-converters/lib/modernExtend');
const fz = require('zigbee-herdsman-converters/converters/fromZigbee');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const utils = require('zigbee-herdsman-converters/lib/utils');
const ota = require('zigbee-herdsman-converters/lib/ota');
const e = exposes.presets;
const ea = exposes.access;

const aminaManufacturer = {manufacturerCode: 0x143B};

const Amina_S_Control = {
    cluster: 0xFEE7,
    alarms: 0x02,
    ev_status: 0x03,
    connect_status: 0x04,
    single_phase: 0x05,
    offline_current: 0x06,
    offline_single_phase: 0x07,
    time_to_offline: 0x08,
    enable_offline: 0x09,
    total_active_energy: 0x10,
    last_session_energy: 0x11,
}

const Amina_S_Alarms = ['Welded relay(s)', 'Wrong voltage balance', 'RDC-DD DC Leakage', 'RDC-DD AC Leakage', 
                        'Temperature error', 'Overvoltage alarm', 'Overcurrent alarm', 'Car communication error',
                        'Charger processing error', 'Critical overcurrent alarm'];

const DataType = {
    uint32: 35,
    uint16: 33,
    uint8: 0x20,
    enum8: 0x30,
    bitmap16: 25,
}

const fzLocal = {
    charge_limit: {
        cluster: "genLevelCtrl",
        type: ["attributeReport", "readResponse"],
        convert: (model, msg, publish, options, meta) => {
            const result = {};
            if (msg.data.hasOwnProperty("currentLevel")) {
                result.charge_limit = msg.data["currentLevel"];
            }
            
            return result;
        },
    },

    amina_s: {
        cluster: 'aminaControlCluster',
        type: ["attributeReport", "readResponse"],
        convert: (model, msg, publish, options, meta) => {
            const result = {};
            
            if (msg.data.hasOwnProperty('alarms')) {
                result.alarms = [];
                result.alarm_active = false;

                for (let i = 0; i < Amina_S_Alarms.length; i++){
                    if ((msg.data['alarms'] >> i) & 0x01) {
                        result.alarms.push(Amina_S_Alarms[i]);
                        result.alarm_active = true;
                    }
                }
            }
 
            return result;
        },
    },
};

const tzLocal = {
    charge_limit: {
        key: ['charge_limit'],
        convertSet: async (entity, key, value, meta) => {
            const endpoint = entity.getDevice().getEndpoint(10);
            const payload = {level: value, transtime: 0};
            await endpoint.command('genLevelCtrl', 'moveToLevel', payload, utils.getOptions(meta.mapped, entity));
        },
        
        convertGet: async (entity, key, meta) => {
            const endpoint = entity.getDevice().getEndpoint(10);
            await endpoint.read('genLevelCtrl', ['currentLevel'], aminaManufacturer);
        },
    },

    total_active_power: {
        key: ['total_active_power'],
        convertGet: async (entity, key, meta) => {
            await entity.read('haElectricalMeasurement', ['totalActivePower']);
        },
    },
};

const definition = {
    zigbeeModel: ['amina S'],
    model: 'amina S',
    vendor: 'Amina Distribution AS',
    description: 'Amina S EV Charger',
    ota: ota.zigbeeOTA,
    fromZigbee: [fzLocal.charge_limit, fz.electrical_measurement, fzLocal.amina_s],
    toZigbee: [tzLocal.charge_limit, tzLocal.total_active_power ],
    exposes: [e.numeric('charge_limit', ea.ALL).withUnit('A')
                .withValueMin(6).withValueMax(32).withValueStep(1) // Could min and max be read from level control cluster minLevel and MaxLevel
                .withDescription('Maximum allowed amperage draw'),
            e.numeric('alarms', ea.STATE).withDescription('Alarms reported by EV Charger'),
            e.binary('alarm_active', ea.STATE, 'true', 'false').withDescription('An active alarm is present')
        ],

    extend: [
        electricityMeter({
            cluster: 'electrical',
            threePhase: true,
        }),

        deviceAddCustomCluster(
            'aminaControlCluster',
            {
                ID: Amina_S_Control.cluster,
                manufacturerCode: aminaManufacturer,
                attributes: {
                    alarms: {ID: Amina_S_Control.alarms, type: DataType.bitmap16},
                    evStatus: {ID: Amina_S_Control.ev_status, type: DataType.bitmap16},
                    connectStatus: {ID: Amina_S_Control.connect_status, type: DataType.bitmap16},
                    singlePhase: {ID: Amina_S_Control.single_phase, type: DataType.uint8},
                    offlineCurrent: {ID: Amina_S_Control.offline_current, type: DataType.uint8},
                    offlineSinglePhase: {ID: Amina_S_Control.offline_single_phase, type: DataType.uint8},
                    timeToOffline: {ID: Amina_S_Control.time_to_offline, type: DataType.uint16},
                    enableOffline: {ID: Amina_S_Control.enable_offline, type: DataType.uint8},
                    totalActiveEnergy: {ID: Amina_S_Control.total_active_energy, type: DataType.uint32},
                    lastSessionEnergy: {ID: Amina_S_Control.last_session_energy, type: DataType.uint32},
                },
                commands: {},
                commandsResponse: {},
            }
        ),

        onOff({
            'powerOnBehavior': false,
        }),

        enumLookup({
            name: 'ev_status',
            cluster: 'aminaControlCluster',
            attribute: 'evStatus',
            lookup: {'Not Connected': 0, 'EV Connected': 1, 'Ready to Charge': 3, 'Charging': 7, 'Paused': 11},
            description: 'Current charging status',
            reporting: {min: 0, max: '1_MINUTE', change: 1},
            access: 'STATE_GET',
        }),

        numeric({
            name: 'total_active_power',
            cluster: 'haElectricalMeasurement',
            attribute: 'totalActivePower',
            description: 'Instantaneous measured total active power',
            reporting: {min: 0, max: '1_MINUTE', change: 10},
            unit: 'kW',
            scale: 1000,
            precision: 2,
            access: 'STATE_GET',
        }),

        numeric({
            name: 'total_active_energy',
            cluster: 'aminaControlCluster',
            attribute: 'totalActiveEnergy',
            description: 'Sum of consumed energy',
            reporting: {min: 0, max: '1_MINUTE', change: 10},
            unit: 'kWh',
            scale: 1000,
            precision: 2,
            access: 'STATE_GET',
        }),

        numeric({
            name: 'last_session_energy',
            cluster: 'aminaControlCluster',
            attribute: 'lastSessionEnergy',
            description: 'Sum of consumed energy last session',
            reporting: {min: 0, max: '1_MINUTE', change: 10},
            unit: 'kWh',
            scale: 1000,
            precision: 2,
            access: 'STATE_GET',
        }),

        binary({
            name: 'single_phase',
            cluster: 'aminaControlCluster',
            attribute: 'singlePhase',
            description: 'Enable single phase charging. A restart of charging is required for the change to take effect.',
            valueOn: ['Enable', 1],
            valueOff: ['Disable', 0],
            entityCategory: 'config',
        }),

        binary({
            name: 'enable_offline',
            cluster: 'aminaControlCluster',
            attribute: 'enableOffline',
            description: 'Enable offline mode when connection to the network is lost',
            valueOn: ['Enable', 1],
            valueOff: ['Disable', 0],
            entityCategory: 'config',
        }),

        numeric({
            name: 'time_to_offline',
            cluster: 'aminaControlCluster',
            attribute: 'timeToOffline',
            description: 'Time until charger will behave as offline after connection has been lost',
            valueMin: 0,
            valueMax: 60,
            valueStep: 1,
            unit: 's',
            entityCategory: 'config',
        }),

        numeric({
            name: 'offline_current',
            cluster: 'aminaControlCluster',
            attribute:  'offlineCurrent',
            description: 'Maximum allowed amperage draw when device is offline',
            valueMin: 6,
            valueMax: 32,
            valueStep: 1,
            unit: 'A',
            entityCategory: 'config',
        }),

        binary({
            name: 'offline_single_phase',
            cluster: 'aminaControlCluster',
            attribute: 'offlineSinglePhase',
            description: 'Use single phase charging when device is offline',
            valueOn: ['Enable', 1],
            valueOff: ['Disable', 0],
            entityCategory: 'config',
        }),
    ],

    endpoint: (device) => {
        return {'default': 10};
    },

    configure: async (device, coordinatorEndpoint, logger) => {
        const endpoint = device.getEndpoint(10);

        await endpoint.read(Amina_S_Control.cluster, [
                                                    Amina_S_Control.alarms,
                                                    Amina_S_Control.ev_status,
                                                    Amina_S_Control.connect_status,
                                                    Amina_S_Control.single_phase,
                                                    Amina_S_Control.offline_current,
                                                    Amina_S_Control.offline_single_phase,
                                                    Amina_S_Control.time_to_offline,
                                                    Amina_S_Control.enable_offline,
                                                    Amina_S_Control.total_active_energy,
                                                    Amina_S_Control.last_session_energy
                                                    ]);
    },

};

module.exports = definition;