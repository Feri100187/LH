{
  "_$ver": 1,
  "_$id": "m1traininggame",
  "_$type": "Scene",
  "name": "凌水湖 · M1 水枪训练",
  "left": 0,
  "right": 0,
  "top": 0,
  "bottom": 0,
  "_$comp": [
    {
      "_$type": "05c791e1-eeac-4708-a700-002e211a5589",
      "shoulderDistance": 1.95,
      "shoulderOffset": 0.65,
      "shoulderHeight": 0.32
    },
    {
      "_$type": "9843f0bd-3b49-5cac-9309-32e981259354"
    }
  ],
  "_$child": [
    {
      "_$id": "lingshuiworld",
      "_$type": "Scene3D",
      "name": "LingshuiWorld",
      "ambientMode": 0,
      "ambientColor": {
        "_$type": "Color",
        "r": 0.65,
        "g": 0.69,
        "b": 0.74,
        "a": 1
      },
      "ambientIntensity": 1,
      "skyRenderer": {
        "meshType": "dome",
        "material": {
          "_$uuid": "a41f5cce-adac-4f00-816f-52e312722234",
          "_$type": "Material"
        }
      },
      "enableFog": true,
      "fogStart": 180,
      "fogColor": {
        "_$type": "Color",
        "r": 0.64,
        "g": 0.75,
        "b": 0.83,
        "a": 1
      },
      "_$child": [
        {
          "_$id": "lingshuienvironm",
          "_$prefab": "761ed02f-fa79-41bc-b5f5-fda957facc9b",
          "name": "LingshuiEnvironment"
        },
        {
          "_$id": "playercapsule",
          "_$type": "Sprite3D",
          "name": "PlayerCapsule",
          "transform": {
            "localPosition": {
              "_$type": "Vector3",
              "x": -26,
              "y": 1.88,
              "z": 37.2
            }
          },
          "_$comp": [
            {
              "_$type": "MeshFilter",
              "sharedMesh": {
                "_$uuid": "81a027ba-bf6c-4112-8e81-2a9b06c53290",
                "_$type": "Mesh"
              }
            },
            {
              "_$type": "MeshRenderer",
              "castShadow": true,
              "receiveShadow": true,
              "enabled": false
            }
          ],
          "_$child": [
            {
              "_$id": "playeravatarrig",
              "_$prefab": "e85fe60a-f535-4c66-b60d-9152dcd80153",
              "name": "PlayerAvatar",
              "transform": {
                "localPosition": {
                  "_$type": "Vector3",
                  "x": 0,
                  "y": -0.9,
                  "z": 0
                },
                "localRotation": {
                  "_$type": "Quaternion",
                  "x": 0,
                  "y": 1,
                  "z": 0,
                  "w": 0
                }
              }
            }
          ]
        },
        {
          "_$id": "playercamera",
          "_$type": "Camera",
          "name": "PlayerCamera",
          "transform": {
            "localPosition": {
              "_$type": "Vector3",
              "x": -26,
              "y": 2.6,
              "z": 37.2
            },
            "localRotationEuler": {
              "_$type": "Vector3",
              "x": 0,
              "y": 18,
              "z": 0
            }
          },
          "clearFlag": 1,
          "clearColor": {
            "_$type": "Color",
            "r": 0.56,
            "g": 0.72,
            "b": 0.86,
            "a": 1
          },
          "fieldOfView": 72,
          "nearPlane": 0.06,
          "farPlane": 700,
          "normalizedViewport": {
            "_$type": "Viewport",
            "width": 1,
            "height": 1
          },
          "_$child": [
            {
              "_$id": "fpsarmsmount",
              "_$type": "Sprite3D",
              "name": "FirstPersonArms",
              "_$child": [
                {
                  "_$id": "fpsarmsrig",
                  "_$prefab": "8ffde5eb-70bb-405c-9625-b001db920911",
                  "name": "ArmsRig",
                  "transform": {
                    "localPosition": {
                      "_$type": "Vector3",
                      "x": 0,
                      "y": -1.6,
                      "z": -0.2
                    },
                    "localRotationEuler": {
                      "_$type": "Vector3",
                      "x": 0,
                      "y": 180,
                      "z": 0
                    }
                  }
                }
              ]
            }
          ]
        },
        {
          "_$id": "daylight",
          "_$type": "Sprite3D",
          "name": "晴天阳光",
          "transform": {
            "localRotationEuler": {
              "_$type": "Vector3",
              "x": -42,
              "y": -35,
              "z": 0
            }
          },
          "_$comp": [
            {
              "_$type": "DirectionLightCom",
              "color": {
                "_$type": "Color",
                "r": 1,
                "g": 0.94,
                "b": 0.82,
                "a": 1
              },
              "intensity": 1.2,
              "shadowMode": 2,
              "shadowResolution": 2048,
              "shadowDistance": 95,
              "shadowCascadesMode": 1,
              "shadowDepthBias": 0.8,
              "shadowNormalBias": 0.5,
              "shadowStrength": 0.85
            }
          ]
        },
        {
          "_$id": "lakeduckgroup",
          "_$prefab": "3846e38d-77a3-4fd6-8e87-af451a6f9834",
          "name": "LakeDucks"
        }
      ],
      "fogEnd": 650
    }
  ]
}
