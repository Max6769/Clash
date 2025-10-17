using UnityEngine;

[RequireComponent(typeof(CharacterController))]
public class PlayerController : MonoBehaviour {
  public float walkSpeed = 5f;
  void Update() {
    float h = Input.GetAxis("Horizontal");
    float v = Input.GetAxis("Vertical");
    Vector3 move = transform.right * h + transform.forward * v;
    GetComponent<CharacterController>().Move(move * walkSpeed * Time.deltaTime);
  }
}
